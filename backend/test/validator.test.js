const { test } = require('node:test');
const assert = require('node:assert');
const { isPrivateIPv4, isValidDomain, validateProxyInput } = require('../middleware/validator');

function runValidator(body) {
  const req = { body: { ...body } };
  let statusCode = 200;
  let payload = null;
  let calledNext = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { payload = data; return this; }
  };
  validateProxyInput(req, res, () => { calledNext = true; });
  return { statusCode, payload, calledNext, body: req.body };
}

test('isPrivateIPv4 menerima IP privat & loopback', () => {
  for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.254', '192.168.1.10', '127.0.0.1']) {
    assert.ok(isPrivateIPv4(ip), ip);
  }
});

test('isPrivateIPv4 menolak IP publik, format salah, dan injeksi', () => {
  const bad = [
    '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '999.1.1.1', '10.0.0',
    '10.0.0.1:1; } server { listen 80; root /etc; }#', // injeksi yang dulu lolos
    '8.8.8.8 evil 192.168.1.1',                        // injeksi yang dulu lolos
    '10.0.0.1\n', ' 10.0.0.1', '10.0.0.1;', '::1', '', null, undefined, 10
  ];
  for (const ip of bad) {
    assert.strictEqual(isPrivateIPv4(ip), false, JSON.stringify(ip));
  }
});

test('isValidDomain', () => {
  for (const d of ['app.example.com', 'acs.ids.net.id', 'a-b.c.co', 'xn--80ak6aa92e.com']) {
    assert.ok(isValidDomain(d), d);
  }
  for (const d of ['localhost', 'example', '-a.com', 'a..com', 'a.com;', 'a.com {', '../etc/passwd', 'a.com/x', 'A.COM', '']) {
    assert.strictEqual(isValidDomain(d), false, d);
  }
});

test('validateProxyInput: input valid dinormalisasi', () => {
  const r = runValidator({ domain_name: '  App.Example.COM ', target_ip: 'localhost', target_port: '8080', waf_mode: 'on', ssl_enabled: 1 });
  assert.ok(r.calledNext);
  assert.strictEqual(r.body.domain_name, 'app.example.com');
  assert.strictEqual(r.body.target_ip, '127.0.0.1');
  assert.strictEqual(r.body.target_port, 8080);
  assert.strictEqual(r.body.ssl_enabled, true);
});

test('validateProxyInput: menolak injeksi target_ip', () => {
  const r = runValidator({ domain_name: 'a.example.com', target_ip: '10.0.0.1:1; } server { root /etc; }#', target_port: 80 });
  assert.strictEqual(r.calledNext, false);
  assert.strictEqual(r.statusCode, 400);
});

test('validateProxyInput: menolak port tidak valid', () => {
  for (const port of ['80; evil', '0', '65536', '8o', -1, 1.5, '']) {
    const r = runValidator({ domain_name: 'a.example.com', target_ip: '10.0.0.1', target_port: port });
    assert.strictEqual(r.calledNext, false, JSON.stringify(port));
  }
});

test('validateProxyInput: menolak waf_mode tidak dikenal', () => {
  const r = runValidator({ domain_name: 'a.example.com', target_ip: '10.0.0.1', target_port: 80, waf_mode: "on; evil" });
  assert.strictEqual(r.calledNext, false);
});
