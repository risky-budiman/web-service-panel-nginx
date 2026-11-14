const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const SECRET_FILE = process.env.JWT_SECRET_FILE || path.join(__dirname, '..', 'data', '.jwt_secret');

/**
 * Ambil JWT secret:
 *   1. dari env JWT_SECRET (direkomendasikan, dibuat otomatis oleh deploy.sh)
 *   2. jika tidak ada, dari file data/.jwt_secret (dibuat acak sekali, izin 600)
 * Tidak ada lagi secret bawaan yang tertulis di kode.
 */
function loadJwtSecret() {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 32) {
      console.warn('⚠️  JWT_SECRET kurang dari 32 karakter. Disarankan: openssl rand -hex 32');
    }
    return fromEnv;
  }

  try {
    if (fs.existsSync(SECRET_FILE)) {
      const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (saved.length >= 32) return saved;
    }
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    console.warn(`⚠️  JWT_SECRET tidak di-set. Secret acak dibuat dan disimpan di ${SECRET_FILE}`);
    return generated;
  } catch (err) {
    console.error('❌ Gagal menyiapkan JWT secret:', err.message);
    throw new Error('JWT secret tidak tersedia. Set JWT_SECRET di file .env');
  }
}

const JWT_SECRET = loadJwtSecret();

/**
 * Middleware autentikasi JWT (header Authorization: Bearer <token>)
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token autentikasi diperlukan' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah expired' });
  }
}

/**
 * Wajibkan user sudah mengganti password default sebelum memakai API lain.
 * Endpoint ganti password & info akun tetap boleh diakses.
 */
function requirePasswordChanged(req, res, next) {
  const { queryOne } = require('../db/database');
  const user = queryOne('SELECT must_change_password FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Akun tidak ditemukan' });
  }
  if (user.must_change_password) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Anda wajib mengganti password default terlebih dahulu'
    });
  }
  next();
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY, algorithm: 'HS256' });
}

module.exports = { authMiddleware, requirePasswordChanged, generateToken };
