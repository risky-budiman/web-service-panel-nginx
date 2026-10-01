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
  const clean = (domain || '').trim().toLowerCase();
  const apex = clean.startsWith('www.') ? clean.substring(4) : clean;
  const www = `www.${apex}`;

  // Cek path domain, apex, atau www
  const candidates = [clean, apex, www];
  for (const name of candidates) {
    const certPath = `/etc/letsencrypt/live/${name}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${name}/privkey.pem`;
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Baca metadata sertifikat nyata dari disk jika ada
 */
function getCertificateInfo(domain) {
  const fs = require('fs');
  const clean = (domain || '').trim().toLowerCase();
  const apex = clean.startsWith('www.') ? clean.substring(4) : clean;
  const www = `www.${apex}`;

  const candidates = [clean, apex, www];
  for (const name of candidates) {
    const certPath = `/etc/letsencrypt/live/${name}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${name}/privkey.pem`;
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      try {
        const stats = fs.statSync(certPath);
        return {
          exists: true,
          liveDomain: name,
          certPath,
          keyPath,
          updatedAt: stats.mtime
        };
      } catch (_) {}
    }
  }
  return { exists: false };
}

/**
 * Helper untuk menyusun domain args (-d domain -d www.domain)
 */
function getDomainArgs(domain) {
  const clean = (domain || '').trim().toLowerCase();
  const domains = [clean];
  if (clean.startsWith('www.')) {
    const apex = clean.substring(4);
    if (apex && !domains.includes(apex)) domains.push(apex);
  } else {
    const www = `www.${clean}`;
    if (!domains.includes(www)) domains.push(www);
  }
  return domains.map(d => `-d ${d}`).join(' ');
}

/**
 * Request atau renew sertifikat SSL via Certbot (Let's Encrypt)
 */
async function obtainCertificate(domain) {
  if (!isLinux) {
    console.log(`⚠️  Certbot skipped for domain ${domain} (bukan Linux)`);
    return { success: true, message: 'Certbot skipped (development mode)' };
  }

  const domainFlags = getDomainArgs(domain);

  try {
    console.log(`🚀 Menjalankan Certbot untuk domain: ${domainFlags}...`);
    
    // Pastikan webroot directory ada
    try {
      await execAsync('mkdir -p /var/www/html/.well-known/acme-challenge');
    } catch (_) {}

    // Jalankan certbot dengan plugin nginx terlebih dahulu
    let cmd = `certbot certonly --nginx ${domainFlags} --expand --non-interactive --agree-tos --register-unsafely-without-email 2>&1`;
    let { stdout, stderr } = await execAsync(cmd).catch(async (err) => {
      console.warn(`⚠️  Certbot nginx mode warning, mencoba fallback ke webroot:`, err.message);
      // Fallback ke webroot jika mode nginx gagal
      const fallbackCmd = `certbot certonly --webroot -w /var/www/html ${domainFlags} --expand --non-interactive --agree-tos --register-unsafely-without-email 2>&1`;
      return await execAsync(fallbackCmd);
    });

    const output = stdout || stderr;
    console.log(`📋 Hasil Certbot ${domain}:\n`, output);

    if (hasCertificate(domain)) {
      return { success: true, message: `Sertifikat SSL untuk ${domain} (termasuk www) berhasil diterbitkan oleh Let's Encrypt`, output };
    } else {
      return { success: false, message: 'Certbot selesai tetapi sertifikat belum ditemukan di disk', output };
    }
  } catch (err) {
    const errOutput = err.stdout || err.stderr || err.message;
    console.error(`❌ Certbot error untuk ${domain}:`, errOutput);
    return {
      success: false,
      message: 'Gagal menerbitkan/memperbarui sertifikat SSL: ' + errOutput,
      error: errOutput
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

module.exports = { testConfig, reloadNginx, getNginxStatus, hasCertificate, obtainCertificate, getCertificateInfo };
