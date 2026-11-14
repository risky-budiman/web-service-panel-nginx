const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-waf-'));
const AUDIT = path.join(dir, 'modsec_audit.log');
process.env.MODSEC_AUDIT_LOG = AUDIT;
const WafLogParser = require('../services/waf_log_parser');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Format ModSecurity v3 (Serial) seperti di server produksi
const FIXTURE = `---aaa11111---A--
[14/Nov/2026:09:59:10 +0700] 173155315011.1 203.0.113.5 51234 10.0.0.1 443
---aaa11111---B--
GET /.env HTTP/1.1
Host: ids.net.id
User-Agent: zgrab/0.x
---aaa11111---F--
HTTP/1.1 403
---aaa11111---H--
ModSecurity: Warning. Matched "Operator \`PmFromFile'" [id "930130"] [msg "Restricted File Access Attempt"] [data "Matched Data: /.env found"] [severity "2"] [ver "OWASP_CRS/3.3.5"]
ModSecurity: Access denied with code 403 (phase 2). [id "949110"] [msg "Inbound Anomaly Score Exceeded (Total Score: 5)"] [severity "2"]
---aaa11111---Z--

---bbb22222---A--
[14/Nov/2026:10:01:00 +0700] 173155326022.1 198.51.100.7 40000 10.0.0.1 443
---bbb22222---B--
PUT /api/devices/x HTTP/2.0
host: acs.ids.net.id:443
user-agent: curl/8.0
---bbb22222---F--
HTTP/2.0 200
---bbb22222---H--
ModSecurity: Warning. [id "920440"] [msg "URL file extension is restricted by policy"] [severity "NOTICE"]
ModSecurity: Warning. [id "942100"] [msg "SQL Injection Attack Detected via libinjection"] [severity "CRITICAL"]
---bbb22222---Z--

---ccc33333---A--
[14/Nov/2026:10:02:00 +0700] 173155332033.1 203.0.113.5 51300 10.0.0.1 443
---ccc33333---B--
GET /nonexistent HTTP/1.1
Host: ids.net.id
---ccc33333---F--
HTTP/1.1 404
---ccc33333---Z--
`;

test('audit log tidak ada → available=false', async () => {
  const r = await WafLogParser.getLogs();
  assert.strictEqual(r.available, false);
});

test('parse entri: IP, host (termasuk HTTP/2 huruf kecil & port), method, status, rule', async () => {
  fs.writeFileSync(AUDIT, FIXTURE);
  const { logs } = await WafLogParser.getLogs({ limit: 50 });
  assert.strictEqual(logs.length, 3);
  assert.strictEqual(logs[0].uri, '/nonexistent', 'terbaru di atas');

  const env = logs.find(l => l.uri === '/.env');
  assert.deepStrictEqual(
    [env.client_ip, env.domain, env.method, env.status_code, env.rule_id, env.rule_message, env.is_attack],
    ['203.0.113.5', 'ids.net.id', 'GET', 403, '930130', 'Restricted File Access Attempt', true]
  );

  const acs = logs.find(l => l.uri === '/api/devices/x');
  assert.strictEqual(acs.domain, 'acs.ids.net.id');
  assert.strictEqual(acs.method, 'PUT');
  assert.strictEqual(acs.status_code, 200);

  const nf = logs.find(l => l.uri === '/nonexistent');
  assert.strictEqual(nf.is_attack, false);
  assert.strictEqual(nf.status_code, 404);
});

test('severity angka CRS dipetakan ke nama & diambil yang paling parah', async () => {
  fs.writeFileSync(AUDIT, FIXTURE);
  const { logs } = await WafLogParser.getLogs({ limit: 50 });
  assert.strictEqual(logs.find(l => l.uri === '/.env').severity, 'CRITICAL', '[severity "2"] = CRITICAL');
  assert.strictEqual(logs.find(l => l.uri === '/api/devices/x').severity, 'CRITICAL', 'NOTICE lalu CRITICAL → CRITICAL');
});

test('filter, pencarian, dan statistik', async () => {
  fs.writeFileSync(AUDIT, FIXTURE);
  assert.strictEqual((await WafLogParser.getLogs({ filter: 'attacks' })).logs.length, 2);
  assert.strictEqual((await WafLogParser.getLogs({ filter: 'blocked' })).logs.length, 1);
  assert.strictEqual((await WafLogParser.getLogs({ filter: 'non_attacks' })).logs.length, 1);
  assert.strictEqual((await WafLogParser.getLogs({ search: '942100' })).logs.length, 1);
  assert.strictEqual((await WafLogParser.getLogs({ domain: 'acs.ids.net.id' })).logs.length, 1);

  const stats = await WafLogParser.getStats();
  assert.strictEqual(stats.total_attacks, 2);
  assert.strictEqual(stats.total_blocked, 1);
  assert.deepStrictEqual(stats.top_ips.map(x => x.key).sort(), ['198.51.100.7', '203.0.113.5']);
});

test('hanya membaca bagian akhir file besar; entri terpotong di awal diabaikan', async () => {
  // Isi awal: sisa entri terpotong (tanpa boundary A) → tidak boleh menghasilkan entri rusak
  fs.writeFileSync(AUDIT, 'Host: potongan-entri-lama\n---zzz---H--\n[id "1"]\n---zzz---Z--\n' + FIXTURE);
  const { logs } = await WafLogParser.getLogs({ limit: 50 });
  assert.strictEqual(logs.length, 3);
  assert.ok(logs.every(l => l.client_ip), 'semua entri punya IP');
});

test('multi-rule: rule utama = deteksi paling parah, rule skor 949110 bukan rule utama', async () => {
  fs.writeFileSync(AUDIT, FIXTURE);
  const { logs } = await WafLogParser.getLogs({ limit: 50 });
  const acs = logs.find(l => l.uri === '/api/devices/x');
  assert.strictEqual(acs.rule_id, '942100', 'CRITICAL mengalahkan NOTICE (920440) walau muncul belakangan');
  assert.strictEqual(acs.rules.length, 2);
  assert.strictEqual(logs.find(l => l.uri === '/.env').rule_id, '930130', '949110 hanya skor anomali');

  const stats = await WafLogParser.getStats();
  const keys = stats.top_rules.map(r => r.key);
  assert.ok(keys.some(k => k.includes('942100')) && keys.some(k => k.includes('920440')), 'semua rule deteksi dihitung');
  assert.ok(!keys.some(k => k.includes('949110')), 'rule skor anomali tidak dihitung');
});
