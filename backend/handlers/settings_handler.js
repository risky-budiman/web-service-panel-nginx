const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const { queryOne, runAndSave, saveDb, DB_PATH } = require('../db/database');
const systemExec = require('../services/system_executor');

/**
 * GET /api/settings/system — Informasi sistem & status
 */
async function getSystemInfo(req, res) {
  try {
    const nginxStatus = await systemExec.getNginxStatus();
    const confDir = process.env.NGINX_CONF_DIR || path.join(__dirname, '..', 'nginx-configs');

    res.json({
      success: true,
      data: {
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        platform: process.platform,
        node_version: process.version,
        uptime_seconds: Math.floor(process.uptime()),
        memory: {
          total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
          free: Math.round(os.freemem() / 1024 / 1024) + ' MB'
        },
        nginx_conf_dir: confDir,
        db_path: path.resolve(path.join(__dirname, '..', 'data', 'panel.db')),
        nginx_status: nginxStatus
      }
    });
  } catch (err) {
    console.error('Error getSystemInfo:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil info sistem' });
  }
}

/**
 * POST /api/settings/change-password — Ganti password admin
 */
function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter' });
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Password saat ini salah' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    runAndSave('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    res.json({ success: true, message: 'Password berhasil diubah' });
  } catch (err) {
    console.error('Error changePassword:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah password' });
  }
}

/**
 * GET /api/settings/backup-db — Download backup database SQLite
 */
function backupDatabase(req, res) {
  try {
    saveDb();
    const dbFile = path.join(__dirname, '..', 'data', 'panel.db');
    if (!fs.existsSync(dbFile)) {
      return res.status(404).json({ success: false, message: 'File database tidak ditemukan' });
    }

    const filename = `panel-backup-${new Date().toISOString().slice(0, 10)}.db`;
    res.download(dbFile, filename);
  } catch (err) {
    console.error('Error backupDatabase:', err);
    res.status(500).json({ success: false, message: 'Gagal mendownload backup database' });
  }
}

module.exports = {
  getSystemInfo,
  changePassword,
  backupDatabase
};
