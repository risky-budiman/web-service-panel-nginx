const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'panel.db');

// Pastikan folder data ada
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
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
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Buat admin default jika belum ada
  const bcrypt = require('bcryptjs');
  const existingAdmin = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('✅ Default admin created (username: admin, password: admin123)');
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

module.exports = { initDb, getDb, saveDb, closeDb, runAndSave, queryAll, queryOne };
