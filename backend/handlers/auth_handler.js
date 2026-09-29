const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const { queryOne } = require('../db/database');

/**
 * POST /api/auth/login — Login
 */
function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password wajib diisi'
      });
    }

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    const token = generateToken({ id: user.id, username: user.username });

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: { id: user.id, username: user.username }
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
  res.json({
    success: true,
    data: { id: req.user.id, username: req.user.username }
  });
}

module.exports = { login, getCurrentUser };
