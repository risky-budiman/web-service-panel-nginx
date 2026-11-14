const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const confDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-conf-'));
process.env.NGINX_CONF_DIR = confDir;
process.env.PANEL_SYSTEM_COMMANDS = 'off';

const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');

const baseProxy = {
  id: 1,
  domain_name: 'app.example.com',
  target_ip: '10.0.0.5',
  target_port: 8080,
  ssl_enabled: 0,
  waf_mode: 'on',
  status: 'active'
};

const confPath = (d) => path.join(confDir, `${d}.conf`);
let originalReload;

before(() => { originalReload = systemExec.reloadNginx; });
after(() => {
  systemExec.reloadNginx = originalReload;
  fs.rmSync(confDir, { recursive: true, force: true });
});

test('generateConfig menulis upstream & server_name yang benar', () => {
  const { config } = configGen.generateConfig({ ...baseProxy });
  assert.match(config, /server 10\.0\.0\.5:8080 max_fails=3/);
  assert.match(config, /server_name app\.example\.com www\.app\.example\.com;/);
  assert.match(config, /modsecurity on;/);
});

test('generateConfig menolak data proxy berbahaya dari database lama', () => {
  assert.throws(() => configGen.generateConfig({ ...baseProxy, target_ip: '10.0.0.1:1; } server { root /etc; }#' }));
  assert.throws(() => configGen.generateConfig({ ...baseProxy, domain_name: '../../etc/x' }));
  assert.throws(() => configGen.generateConfig({ ...baseProxy, target_port: '80; evil' }));
});

test('template: webhook regex dikunci, cache tidak dipakai untuk request ber-Authorization', () => {
  const { config } = configGen.generateConfig({ ...baseProxy });
  assert.match(config, /webhook-waiting\)\(\/\|\$\) \{/);
  assert.match(config, /proxy_no_cache \$http_authorization;/);
  assert.match(config, /proxy_cache_bypass \$http_authorization;/);
});

test('removeConfig ikut menghapus file .disabled', () => {
  const d = 'gone.example.com';
  fs.writeFileSync(confPath(d), 'x');
  fs.writeFileSync(`${confPath(d)}.disabled`, 'y');
  configGen.removeConfig(d);
  assert.ok(!fs.existsSync(confPath(d)));
  assert.ok(!fs.existsSync(`${confPath(d)}.disabled`));
});

test('writeProxyConfig menghormati status inactive', () => {
  const d = 'off.example.com';
  configGen.writeProxyConfig({ ...baseProxy, domain_name: d, status: 'inactive' });
  assert.ok(!fs.existsSync(confPath(d)));
  assert.ok(fs.existsSync(`${confPath(d)}.disabled`));
});

test('applyConfigChange: sukses menyimpan perubahan', async () => {
  systemExec.reloadNginx = async () => ({ success: true });
  const d = 'ok.example.com';
  const r = await configGen.applyConfigChange([d], () => configGen.generateConfig({ ...baseProxy, domain_name: d }));
  assert.strictEqual(r.success, true);
  assert.ok(fs.existsSync(confPath(d)));
});

test('applyConfigChange: nginx -t gagal → file dikembalikan persis seperti semula', async () => {
  const d = 'rollback.example.com';
  fs.writeFileSync(confPath(d), 'ORIGINAL CONTENT');
  systemExec.reloadNginx = async () => ({
    success: false,
    message: 'Reload dibatalkan: konfigurasi tidak valid',
    testResult: { output: 'nginx: [emerg] unexpected "}"' }
  });

  const r = await configGen.applyConfigChange([d], () => {
    configGen.generateConfig({ ...baseProxy, domain_name: d, target_port: 9999 });
  });

  assert.strictEqual(r.success, false);
  assert.match(r.output, /emerg/);
  assert.strictEqual(fs.readFileSync(confPath(d), 'utf8'), 'ORIGINAL CONTENT');
});

test('applyConfigChange: file baru dihapus lagi saat rollback', async () => {
  const d = 'newfail.example.com';
  systemExec.reloadNginx = async () => ({ success: false, message: 'fail' });
  const r = await configGen.applyConfigChange([d], () => configGen.generateConfig({ ...baseProxy, domain_name: d }));
  assert.strictEqual(r.success, false);
  assert.ok(!fs.existsSync(confPath(d)));
});

test('applyConfigChange: ganti domain lalu gagal → config domain lama kembali', async () => {
  const oldD = 'old.example.com';
  const newD = 'new.example.com';
  fs.writeFileSync(confPath(oldD), 'OLD');
  systemExec.reloadNginx = async () => ({ success: false, message: 'fail' });
  const r = await configGen.applyConfigChange([oldD, newD], () => {
    configGen.removeConfig(oldD);
    configGen.generateConfig({ ...baseProxy, domain_name: newD });
  });
  assert.strictEqual(r.success, false);
  assert.strictEqual(fs.readFileSync(confPath(oldD), 'utf8'), 'OLD');
  assert.ok(!fs.existsSync(confPath(newD)));
});

test('template: /webhook-waiting/ ikut bypass WAF, tanpa sub_filter', () => {
  const { config } = configGen.generateConfig({ ...baseProxy });
  assert.match(config, /webhook-test\|webhook-waiting\)\(\/\|\$\) \{/);
  assert.doesNotMatch(config, /sub_filter|Accept-Encoding/);
});

test('regenerateAllConfigs: Nginx menolak → seluruh folder config dikembalikan', async () => {
  const ProxyModel = require('../models/proxy');
  const originalGetAll = ProxyModel.getAll;
  ProxyModel.getAll = () => [{ ...baseProxy, domain_name: 'regen.example.com' }];

  for (const f of fs.readdirSync(confDir)) fs.rmSync(path.join(confDir, f));
  fs.writeFileSync(confPath('regen.example.com'), 'LAMA');
  fs.writeFileSync(path.join(confDir, '00-optimization-globals.conf'), 'GLOBAL LAMA');
  systemExec.reloadNginx = async () => ({ success: false, message: 'fail', testResult: { output: 'emerg' } });

  try {
    const r = await configGen.regenerateAllConfigs();
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.rolledBack, true);
    assert.strictEqual(fs.readFileSync(confPath('regen.example.com'), 'utf8'), 'LAMA');
    assert.strictEqual(fs.readFileSync(path.join(confDir, '00-optimization-globals.conf'), 'utf8'), 'GLOBAL LAMA');
    assert.ok(!fs.existsSync(path.join(confDir, '00-default-block.conf')), 'file baru harus dihapus');
  } finally {
    ProxyModel.getAll = originalGetAll;
  }
});
