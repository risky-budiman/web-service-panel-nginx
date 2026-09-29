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

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Disposition', `attachment; filename=nginx-panel-backup-${dateStr}.db`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const fileStream = fs.createReadStream(dbFile);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Error backupDatabase:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat backup database' });
  }
}

/**
 * POST /api/settings/restore-db — Restore database SQLite dari file upload binary
 */
function restoreDatabase(req, res) {
  try {
    const { reloadDbFromDisk } = require('../db/database');
    const dbFile = path.join(__dirname, '..', 'data', 'panel.db');

    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, message: 'File database tidak valid atau kosong' });
    }

    // Buat cadangan database lama terlebih dahulu
    if (fs.existsSync(dbFile)) {
      const backupOld = path.join(__dirname, '..', 'data', 'panel.db.bak');
      fs.copyFileSync(dbFile, backupOld);
    }

    // Tulis database baru
    fs.writeFileSync(dbFile, req.body);

    // Muat ulang instance database di memori
    reloadDbFromDisk();

    res.json({
      success: true,
      message: 'Database berhasil dipulihkan (restore) dan dimuat ulang!'
    });
  } catch (err) {
    console.error('Error restoreDatabase:', err);
    res.status(500).json({ success: false, message: 'Gagal merestore database: ' + err.message });
  }
}

module.exports = {
  getSystemInfo,
  changePassword,
  backupDatabase,
  restoreDatabase
};
