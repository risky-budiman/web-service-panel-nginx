const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.PANEL_DB_PATH || path.join(__dirname, '..', 'data', 'panel.db');

// Pastikan folder data ada
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DEFAULT_ADMIN_PASSWORD = 'admin123';

let db = null;
let SQL = null;

/**
 * Inisialisasi database (async - harus dipanggil sekali saat startup)
 */
async function initDb() {
  if (db) return db;

  SQL = await initSqlJs();

  // Load existing database atau buat baru
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initializeSchema();
  saveDb();

  return db;
}

/**
 * Reload database dari file di disk (setelah proses restore)
 */
function reloadDbFromDisk() {
  if (SQL && fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    if (db) db.close();
    db = new SQL.Database(fileBuffer);
    initializeSchema();
    saveDb();
    return true;
  }
  return false;
}

/**
 * Validasi buffer file database sebelum dipakai untuk restore.
 * Melempar Error dengan pesan yang jelas jika tidak valid.
 */
function validateDbBuffer(buffer) {
  if (!SQL) throw new Error('Database belum diinisialisasi');
  const MAGIC = Buffer.from('SQLite format 3' + String.fromCharCode(0), 'latin1');
  if (!Buffer.isBuffer(buffer) || buffer.length < 512 || !buffer.subarray(0, 16).equals(MAGIC)) {
    throw new Error('File bukan database SQLite yang valid');
  }

  let candidate;
  try {
    candidate = new SQL.Database(buffer);
    const integrity = candidate.exec('PRAGMA integrity_check');
    if (integrity[0]?.values?.[0]?.[0] !== 'ok') {
      throw new Error('Database rusak (integrity_check gagal)');
    }
    const tables = (candidate.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values || []).map(r => r[0]);
    for (const required of ['proxy_hosts', 'users']) {
      if (!tables.includes(required)) throw new Error(`Tabel '${required}' tidak ditemukan di file backup`);
    }
    const cols = (candidate.exec('PRAGMA table_info(users)')[0]?.values || []).map(r => r[1]);
    for (const required of ['username', 'password_hash']) {
      if (!cols.includes(required)) throw new Error(`Kolom users.${required} tidak ditemukan di file backup`);
    }
    const userCount = candidate.exec('SELECT COUNT(*) FROM users')[0]?.values?.[0]?.[0] || 0;
    if (userCount < 1) throw new Error('File backup tidak memiliki akun user');
  } catch (err) {
    if (err.message && !/^file is not a database/i.test(err.message)) throw err;
    throw new Error('File bukan database SQLite yang valid');
  } finally {
    if (candidate) candidate.close();
  }
}

/**
 * Ambil instance database
 */
function getDb() {
  if (!db) {
    throw new Error('Database belum diinisialisasi. Panggil initDb() terlebih dahulu.');
  }
  return db;
}

/**
 * Simpan database ke disk
 */
function saveDb() {
  if (!db) return;
  const buffer = Buffer.from(db.export());
  // Tulis atomik: file sementara lalu rename, agar panel.db tidak rusak
  // jika proses mati di tengah penulisan.
  const tmpPath = `${DB_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, buffer, { mode: 0o600 });
  fs.renameSync(tmpPath, DB_PATH);
}

/**
 * Jalankan query dan simpan otomatis (untuk INSERT, UPDATE, DELETE)
 */
function runAndSave(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

/**
 * Jalankan SELECT query, return array of objects
 */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Jalankan SELECT query, return single object atau null
 */
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Inisialisasi skema tabel
 */
function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS proxy_hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_name TEXT NOT NULL UNIQUE,
      target_ip TEXT NOT NULL,
      target_port INTEGER NOT NULL DEFAULT 80,
      ssl_enabled INTEGER NOT NULL DEFAULT 0,
      waf_mode TEXT NOT NULL DEFAULT 'off' CHECK(waf_mode IN ('off', 'detection', 'on')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safe migration: tambahkan kolom waf_mode jika belum ada (untuk database yang sudah ada)
  try {
    const tableInfo = queryAll("PRAGMA table_info(proxy_hosts)");
    const hasWafMode = tableInfo.some(col => col.name === 'waf_mode');
    if (!hasWafMode) {
      db.run("ALTER TABLE proxy_hosts ADD COLUMN waf_mode TEXT NOT NULL DEFAULT 'off'");
      console.log("🛡️ Migrasi database sukses: kolom 'waf_mode' berhasil ditambahkan.");
    }
  } catch (err) {
    console.warn("Notice checking table migration:", err.message);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safe migration: kolom must_change_password untuk database lama
  const userCols = queryAll('PRAGMA table_info(users)');
  if (!userCols.some(col => col.name === 'must_change_password')) {
    db.run('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
    console.log("🔐 Migrasi database: kolom 'must_change_password' ditambahkan.");
  }

  // Buat admin default jika belum ada user sama sekali.
  // Password default WAJIB diganti saat login pertama.
  const bcrypt = require('bcryptjs');
  const anyUser = queryOne('SELECT id FROM users LIMIT 1');
  if (!anyUser) {
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 12);
    db.run('INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, 1)', ['admin', hash]);
    console.log(`✅ Default admin dibuat (username: admin, password: ${DEFAULT_ADMIN_PASSWORD}) — wajib diganti saat login pertama`);
  }
}

/**
 * Tutup database
 */
function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

module.exports = {
  initDb, getDb, saveDb, closeDb, runAndSave, queryAll, queryOne,
  reloadDbFromDisk, validateDbBuffer, DB_PATH, DEFAULT_ADMIN_PASSWORD
};
