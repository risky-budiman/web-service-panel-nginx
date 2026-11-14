/**
 * Test integrasi API: menjalankan server.js sungguhan dengan database, folder
 * config Nginx, dan folder log sementara (data asli tidak disentuh).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-api-'));
let server;
let base;
let output = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function api(method, url, { token, body, raw, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (raw !== undefined) {
    opts.headers['Content-Type'] = 'application/octet-stream';
    opts.body = raw;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + url, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

const login = (username, password) => api('POST', '/api/auth/login', { body: { username, password } });

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      PANEL_DB_PATH: path.join(tmp, 'panel.db'),
      JWT_SECRET: 'test-secret-'.padEnd(64, 'x'),
      NGINX_CONF_DIR: path.join(tmp, 'conf'),
      NGINX_LOG_DIR: path.join(tmp, 'logs'),
      MODSEC_AUDIT_LOG: path.join(tmp, 'modsec_audit.log'),
      LOGIN_RATE_LIMIT: '5',
      PANEL_SYSTEM_COMMANDS: 'off'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', d => { output += d; });
  server.stderr.on('data', d => { output += d; });

  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server tidak start:\n' + output);
});

after(() => {
  if (server) server.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
});

let token;
const NEW_PASSWORD = 'PasswordBaru-2026!';

test('login: password salah ditolak', async () => {
  const r = await login('admin', 'salah');
  assert.strictEqual(r.status, 401);
});

test('login default berhasil tetapi wajib ganti password', async () => {
  const r = await login('admin', 'admin123');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.user.must_change_password, true);
  token = r.data.data.token;
});

test('API lain diblokir (403) sebelum password default diganti', async () => {
  const r = await api('GET', '/api/proxies', { token });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('/api/auth/me tetap bisa diakses dan melaporkan flag', async () => {
  const r = await api('GET', '/api/auth/me', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.must_change_password, true);
});

test('ganti password: aturan minimal ditegakkan', async () => {
  let r = await api('POST', '/api/settings/change-password', { token, body: { currentPassword: 'admin123', newPassword: 'pendek' } });
  assert.strictEqual(r.status, 400);
  r = await api('POST', '/api/settings/change-password', { token, body: { currentPassword: 'admin123', newPassword: 'admin123' } });
  assert.strictEqual(r.status, 400);
});

test('ganti password berhasil → API terbuka', async () => {
  let r = await api('POST', '/api/settings/change-password', { token, body: { currentPassword: 'admin123', newPassword: NEW_PASSWORD } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await api('GET', '/api/proxies', { token });
  assert.strictEqual(r.status, 200);
  r = await login('admin', 'admin123');
  assert.strictEqual(r.status, 401);
  r = await login('admin', NEW_PASSWORD);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.user.must_change_password, false);
  token = r.data.data.token;
});

test('token palsu / tanpa token ditolak', async () => {
  assert.strictEqual((await api('GET', '/api/proxies')).status, 401);
  assert.strictEqual((await api('GET', '/api/proxies', { token: 'abc.def.ghi' })).status, 401);
});

test('tidak ada header CORS untuk origin asing', async () => {
  const r = await api('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
});

let proxyId;
test('CRUD proxy: create, injeksi ditolak, PUT, toggle, delete', async () => {
  let r = await api('POST', '/api/proxies', { token, body: { domain_name: 'app.example.com', target_ip: '10.0.0.5', target_port: 8080, waf_mode: 'on' } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  proxyId = r.data.data.id;
  const conf = path.join(tmp, 'conf', 'app.example.com.conf');
  assert.ok(fs.existsSync(conf));

  r = await api('POST', '/api/proxies', { token, body: { domain_name: 'evil.example.com', target_ip: '10.0.0.1:1; } server { root /etc; }#', target_port: 80 } });
  assert.strictEqual(r.status, 400);
  assert.ok(!fs.existsSync(path.join(tmp, 'conf', 'evil.example.com.conf')));

  r = await api('PUT', `/api/proxies/${proxyId}`, { token, body: { domain_name: 'app2.example.com', target_ip: '10.0.0.6', target_port: 9090, waf_mode: 'detection' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.ok(!fs.existsSync(conf), 'config domain lama harus dihapus');
  const conf2 = path.join(tmp, 'conf', 'app2.example.com.conf');
  assert.match(fs.readFileSync(conf2, 'utf8'), /server 10\.0\.0\.6:9090/);

  r = await api('POST', `/api/proxies/${proxyId}/toggle`, { token });
  assert.strictEqual(r.data.data.status, 'inactive');
  assert.ok(fs.existsSync(`${conf2}.disabled`));

  // Ubah WAF saat inactive → tidak boleh mengaktifkan config lagi
  r = await api('POST', `/api/waf/${proxyId}/mode`, { token, body: { waf_mode: 'off' } });
  assert.strictEqual(r.status, 200);
  assert.ok(!fs.existsSync(conf2));
  assert.ok(fs.existsSync(`${conf2}.disabled`));

  r = await api('DELETE', `/api/proxies/${proxyId}`, { token });
  assert.strictEqual(r.status, 200);
  assert.ok(!fs.existsSync(conf2) && !fs.existsSync(`${conf2}.disabled`));
});

test('log: domain tidak terdaftar / path traversal ditolak', async () => {
  for (const domain of ['../../etc/passwd', 'unknown.example.com']) {
    const r = await api('GET', `/api/logs?domain=${encodeURIComponent(domain)}`, { token });
    assert.strictEqual(r.status, 400, domain);
  }
  const r = await api('DELETE', '/api/logs/clear', { token, body: { domain: '../x' } });
  assert.strictEqual(r.status, 400);
});

test('log: tidak ada lagi log palsu saat file belum ada', async () => {
  const r = await api('GET', '/api/logs', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.length, 0);
});

test('backup DB via header Authorization', async () => {
  const r = await api('GET', '/api/settings/backup-db', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.subarray(0, 15).toString('latin1'), 'SQLite format 3');
});

test('restore DB: file sampah ditolak, backup valid diterima', async () => {
  let r = await api('POST', '/api/settings/restore-db', { token, raw: Buffer.from('bukan database') });
  assert.strictEqual(r.status, 400);

  const fake = Buffer.alloc(4096);
  Buffer.from('SQLite format 3\0', 'latin1').copy(fake);
  r = await api('POST', '/api/settings/restore-db', { token, raw: fake });
  assert.strictEqual(r.status, 400);

  const backup = await api('GET', '/api/settings/backup-db', { token });
  r = await api('POST', '/api/settings/restore-db', { token, raw: backup.data });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await login('admin', NEW_PASSWORD);
  assert.strictEqual(r.status, 200);
});

test('rate limit login: percobaan gagal berlebihan → 429 (dijalankan terakhir)', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await login('admin', 'salah-' + i);
  assert.strictEqual(last.status, 429);
});

test('endpoint API tidak dikenal → 404 JSON', async () => {
  const r = await api('GET', '/api/tidak-ada', { token });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.data.success, false);
});

test('index.html tidak di-cache, aset ber-hash di-cache immutable', async () => {
  const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) return; // frontend belum di-build
  const page = await fetch(base + '/?tab=ssl');
  assert.strictEqual(page.headers.get('cache-control'), 'no-cache');
  const asset = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.endsWith('.js'));
  const res = await fetch(`${base}/assets/${asset}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('cache-control'), /immutable/);
});
