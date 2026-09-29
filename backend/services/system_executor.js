const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Deteksi OS — perintah hanya berjalan di Linux
const isLinux = process.platform === 'linux';

/**
 * Test konfigurasi Nginx (nginx -t)
 */
async function testConfig() {
  if (!isLinux) {
    console.log('⚠️  Nginx test skipped (bukan Linux)');
    return { success: true, message: 'Nginx test skipped (development mode - bukan Linux)', skipped: true };
  }

  try {
    const { stdout, stderr } = await execAsync('sudo nginx -t 2>&1');
    const output = stdout || stderr;

    if (output.includes('syntax is ok') && output.includes('test is successful')) {
      return { success: true, message: 'Konfigurasi Nginx valid', output };
    } else {
      return { success: false, message: 'Konfigurasi Nginx tidak valid', output };
    }
  } catch (err) {
    return { success: false, message: 'Gagal menjalankan nginx -t', error: err.message };
  }
}

/**
 * Reload Nginx (systemctl reload nginx)
 */
async function reloadNginx() {
  if (!isLinux) {
    console.log('⚠️  Nginx reload skipped (bukan Linux)');
    return { success: true, message: 'Nginx reload skipped (development mode - bukan Linux)', skipped: true };
  }

  try {
    // Test dulu sebelum reload
    const testResult = await testConfig();
    if (!testResult.success) {
      return { success: false, message: 'Reload dibatalkan: konfigurasi tidak valid', testResult };
    }

    await execAsync('sudo systemctl reload nginx');
    return { success: true, message: 'Nginx berhasil di-reload' };
  } catch (err) {
    return { success: false, message: 'Gagal me-reload Nginx', error: err.message };
  }
}

/**
 * Cek apakah file sertifikat Let's Encrypt sudah ada di disk
 */
function hasCertificate(domain) {
  const fs = require('fs');
  const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
  const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

/**
 * Request sertifikat SSL via Certbot (Let's Encrypt)
 */
async function obtainCertificate(domain) {
  if (!isLinux) {
    console.log(`⚠️  Certbot skipped for domain ${domain} (bukan Linux)`);
    return { success: true, message: 'Certbot skipped (development mode)' };
  }

  try {
    // Jalankan certbot dengan plugin nginx secara non-interaktif
    const cmd = `sudo certbot certonly --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email`;
    const { stdout, stderr } = await execAsync(cmd);
    const output = stdout || stderr;

    if (hasCertificate(domain)) {
      return { success: true, message: 'Sertifikat SSL berhasil diterbitkan oleh Let\'s Encrypt', output };
    } else {
      return { success: false, message: 'Certbot selesai tetapi sertifikat tidak ditemukan', output };
    }
  } catch (err) {
    console.error('Certbot error:', err);
    return {
      success: false,
      message: 'Gagal menerbitkan sertifikat SSL: ' + (err.stderr || err.message),
      error: err.message
    };
  }
}

/**
 * Cek status Nginx
 */
async function getNginxStatus() {
  if (!isLinux) {
    return { running: null, message: 'Status check hanya tersedia di Linux' };
  }

  try {
    const { stdout } = await execAsync('systemctl is-active nginx');
    const isActive = stdout.trim() === 'active';
    return { running: isActive, message: isActive ? 'Nginx sedang berjalan' : 'Nginx tidak aktif' };
  } catch (err) {
    return { running: false, message: 'Nginx tidak aktif atau tidak terinstall' };
  }
}

module.exports = { testConfig, reloadNginx, getNginxStatus, hasCertificate, obtainCertificate };
