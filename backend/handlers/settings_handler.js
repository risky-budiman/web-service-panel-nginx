const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const { queryOne, runAndSave, saveDb, DB_PATH, validateDbBuffer, reloadDbFromDisk, DEFAULT_ADMIN_PASSWORD } = require('../db/database');

const MIN_PASSWORD_LENGTH = 10;
const systemExec = require('../services/system_executor');

/**
 * GET /api/settings/system — Informasi sistem & status
 */
async function getSystemInfo(req, res) {
  try {
    const nginxStatus = await systemExec.getNginxStatus();
    const confDir = require('../services/config_generator').NGINX_CONF_DIR;

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
        db_path: path.resolve(DB_PATH),
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

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter` });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'Password baru maksimal 128 karakter' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ success: false, message: 'Password baru harus berbeda dari password saat ini' });
    }

    if (newPassword === DEFAULT_ADMIN_PASSWORD) {
      return res.status(400).json({ success: false, message: 'Password default tidak boleh dipakai lagi' });
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Password saat ini salah' });
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    runAndSave('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, userId]);

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
    const dbFile = DB_PATH;
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
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, message: 'File database tidak valid atau kosong' });
    }

    // Validasi: header SQLite, integrity_check, tabel & kolom wajib, minimal 1 user
    try {
      validateDbBuffer(req.body);
    } catch (validationErr) {
      return res.status(400).json({ success: false, message: 'Restore ditolak: ' + validationErr.message });
    }

    // Cadangkan database lama terlebih dahulu
    saveDb();
    const backupOld = `${DB_PATH}.bak`;
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupOld);
    }

    // Tulis atomik lalu muat ulang (skema/migrasi otomatis diterapkan)
    const tmpPath = `${DB_PATH}.restore-${process.pid}`;
    fs.writeFileSync(tmpPath, req.body, { mode: 0o600 });
    fs.renameSync(tmpPath, DB_PATH);

    try {
      reloadDbFromDisk();
    } catch (reloadErr) {
      // Kembalikan database lama jika gagal dimuat
      if (fs.existsSync(backupOld)) {
        fs.copyFileSync(backupOld, DB_PATH);
        reloadDbFromDisk();
      }
      throw reloadErr;
    }

    res.json({ success: true, message: 'Database berhasil dipulihkan (restore) dan dimuat ulang!' });
  } catch (err) {
    console.error('Error restoreDatabase:', err);
    res.status(500).json({ success: false, message: 'Gagal merestore database' });
  }
}

/**
 * POST /api/settings/optimize-all — Regenerasi seluruh konfigurasi dengan optimasi performa tinggi
 */
async function optimizeAll(req, res) {
  try {
    const configGen = require('../services/config_generator');
    const result = await configGen.regenerateAllConfigs();
    if (!result.success) {
      return res.status(422).json({
        success: false,
        message: 'Config ditulis tetapi Nginx menolak reload: ' + (result.reloadResult?.message || 'cek nginx -t'),
        data: result
      });
    }
    const skippedNote = result.skipped.length ? ` (${result.skipped.length} domain dilewati karena data tidak valid)` : '';
    res.json({
      success: true,
      message: `Semua konfigurasi proxy (${result.count} domain) berhasil diperbarui dengan akselerasi maksimal!${skippedNote}`,
      data: result
    });
  } catch (err) {
    console.error('Error optimizeAll:', err);
    res.status(500).json({ success: false, message: 'Gagal mengoptimasi konfigurasi' });
  }
}

module.exports = {
  getSystemInfo,
  changePassword,
  backupDatabase,
  restoreDatabase,
  optimizeAll
};
