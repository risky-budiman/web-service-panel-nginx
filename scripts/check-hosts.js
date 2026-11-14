#!/usr/bin/env node
/**
 * Periksa apakah semua proxy host di database lolos validasi versi baru.
 * HANYA MEMBACA database — tidak mengubah apa pun.
 *
 *   node scripts/check-hosts.js [--root <app-dir>] [--db <panel.db>] [--validator <validator.js>]
 *
 * Exit code: 0 = semua valid, 1 = ada host tidak valid, 2 = error.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
// --root: folder aplikasi (berguna saat script dijalankan dari luar repo, mis. /tmp)
const ROOT = arg('--root', path.resolve(__dirname, '..'));

const dbPath = arg('--db', path.join(ROOT, 'backend', 'data', 'panel.db'));
const validatorPath = arg('--validator', path.join(ROOT, 'backend', 'middleware', 'validator.js'));

function loadSqlJs() {
  const candidates = [path.join(ROOT, 'backend', 'node_modules', 'sql.js'), 'sql.js'];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* coba berikutnya */ }
  }
  throw new Error('Modul sql.js tidak ditemukan (jalankan npm install di folder backend)');
}

(async () => {
  try {
    if (!fs.existsSync(dbPath)) {
      console.log(`ℹ️  Database ${dbPath} belum ada — tidak ada host untuk diperiksa.`);
      process.exitCode = 0; return;
    }

    const { isValidDomain, isPrivateIPv4, isValidPort, VALID_WAF_MODES } = require(validatorPath);
    const SQL = await loadSqlJs()();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const result = db.exec('SELECT id, domain_name, target_ip, target_port, waf_mode, status FROM proxy_hosts ORDER BY id');
    db.close();

    const rows = result[0]?.values || [];
    let invalid = 0;

    console.log(`Memeriksa ${rows.length} host di ${dbPath}\n`);
    for (const [id, domain, ip, port, waf, status] of rows) {
      const problems = [];
      if (!isValidDomain(domain)) problems.push('domain');
      if (!isPrivateIPv4(ip === 'localhost' ? '127.0.0.1' : ip)) problems.push('target_ip');
      if (!isValidPort(Number(port))) problems.push('port');
      if (waf && VALID_WAF_MODES && !VALID_WAF_MODES.includes(waf)) problems.push('waf_mode');

      const tag = problems.length ? '❌ GAGAL' : '✅ OK   ';
      if (problems.length) invalid++;
      console.log(`${tag}  #${String(id).padEnd(4)} ${String(domain).padEnd(36)} ${`${ip}:${port}`.padEnd(22)} ${status}` +
        (problems.length ? `   ← tidak valid: ${problems.join(', ')}` : ''));
    }

    console.log('');
    if (invalid > 0) {
      console.log(`⚠️  ${invalid} host tidak lolos validasi baru.`);
      console.log('   Host tersebut tetap online (config lama dipakai), tetapi akan dilewati saat');
      console.log('   regenerasi dan tidak bisa diedit dari UI sampai datanya diperbaiki.');
      process.exitCode = 1; return;
    }
    console.log(`✅ Semua ${rows.length} host lolos validasi.`);
    process.exitCode = 0; return;
  } catch (err) {
    console.error('❌ Gagal memeriksa host:', err.message);
    process.exitCode = 2; return;
  }
})();
