const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const { queryOne, runAndSave, DEFAULT_ADMIN_PASSWORD } = require('../db/database');

// Hash dummy agar waktu respons sama saat username tidak ada (cegah user enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/**
 * POST /api/auth/login — Login
 */
function login(req, res) {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username.trim()]);
    const valid = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !valid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    // Akun lama yang masih memakai password default → wajib ganti
    let mustChange = Boolean(user.must_change_password);
    if (!mustChange && password === DEFAULT_ADMIN_PASSWORD) {
      runAndSave('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
      mustChange = true;
    }

    const token = generateToken({ id: user.id, username: user.username });

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: { id: user.id, username: user.username, must_change_password: mustChange }
      }
    });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ success: false, message: 'Gagal login' });
  }
}

/**
 * GET /api/auth/me — Get current user
 */
function getCurrentUser(req, res) {
  const user = queryOne('SELECT id, username, must_change_password FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Akun tidak ditemukan' });
  }
  res.json({
    success: true,
    data: { id: user.id, username: user.username, must_change_password: Boolean(user.must_change_password) }
  });
}

module.exports = { login, getCurrentUser };
