const ProxyModel = require('../models/proxy');
const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');
const { configRejected } = require('./proxy_handler');

/**
 * GET /api/ssl — Status sertifikat SSL untuk seluruh domain
 */
function getSslCertificates(req, res) {
  try {
    const certificates = ProxyModel.getAll().map(p => {
      const certInfo = systemExec.getCertificateInfo(p.domain_name);
      const isEnabled = Boolean(p.ssl_enabled);
      const hasCertOnDisk = certInfo.exists;
      const expired = hasCertOnDisk && certInfo.expiresAt && new Date(certInfo.expiresAt) < new Date();

      let status = 'Not Configured';
      if (isEnabled && hasCertOnDisk) status = expired ? 'Expired' : 'Active';
      else if (isEnabled && !hasCertOnDisk) status = 'Missing Cert';
      else if (!isEnabled && hasCertOnDisk) status = 'Disabled (Cert Ready)';

      return {
        id: p.id,
        domain_name: p.domain_name,
        ssl_enabled: isEnabled,
        has_cert: hasCertOnDisk,
        issuer: hasCertOnDisk ? (certInfo.issuer || "Let's Encrypt") : 'None',
        status,
        auto_renew: isEnabled,
        // Tanggal kedaluwarsa asli dari sertifikat (null jika tidak bisa dibaca)
        expires_at: certInfo.expiresAt || null
      };
    });

    res.json({ success: true, data: certificates });
  } catch (err) {
    console.error('Error getSslCertificates:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data SSL' });
  }
}

/**
 * POST /api/ssl/request — Terbitkan / perbarui SSL untuk domain
 */
async function requestSsl(req, res) {
  try {
    const proxy = ProxyModel.getById(req.body?.proxy_id);
    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy domain tidak ditemukan' });
    }

    if (process.platform === 'linux') {
      const certResult = await systemExec.obtainCertificate(proxy.domain_name);
      if (!certResult.success) {
        return res.status(502).json({
          success: false,
          message: certResult.message || "Gagal menerbitkan sertifikat Let's Encrypt"
        });
      }
    }

    const updated = ProxyModel.update(proxy.id, { ssl_enabled: 1 });
    const applied = await configGen.applyConfigChange([updated.domain_name], () => {
      configGen.writeProxyConfig(updated);
    });
    if (!applied.success) {
      ProxyModel.restore(proxy);
      return configRejected(res, applied);
    }

    res.json({
      success: true,
      message: `SSL untuk domain '${proxy.domain_name}' berhasil diterbitkan dan diaktifkan`,
      data: updated
    });
  } catch (err) {
    console.error('Error requestSsl:', err);
    res.status(500).json({ success: false, message: 'Gagal mengaktifkan SSL' });
  }
}

/**
 * PATCH|POST /api/ssl/:id/toggle — Toggle SSL aktif / nonaktif
 */
async function toggleSsl(req, res) {
  try {
    const proxy = ProxyModel.getById(req.params.id);
    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy domain tidak ditemukan' });
    }

    const nextSsl = proxy.ssl_enabled ? 0 : 1;

    if (nextSsl && process.platform === 'linux' && !systemExec.hasCertificate(proxy.domain_name)) {
      const certResult = await systemExec.obtainCertificate(proxy.domain_name);
      if (!certResult.success) {
        return res.status(502).json({
          success: false,
          message: certResult.message || "Gagal menerbitkan sertifikat Let's Encrypt"
        });
      }
    }

    const updated = ProxyModel.update(proxy.id, { ssl_enabled: nextSsl });
    const applied = await configGen.applyConfigChange([updated.domain_name], () => {
      configGen.writeProxyConfig(updated);
    });
    if (!applied.success) {
      ProxyModel.restore(proxy);
      return configRejected(res, applied);
    }

    res.json({
      success: true,
      message: `SSL untuk ${updated.domain_name} berhasil ${nextSsl ? 'diaktifkan (HTTPS)' : 'dinonaktifkan (HTTP)'}`,
      data: updated
    });
  } catch (err) {
    console.error('Error toggleSsl:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah status SSL' });
  }
}

module.exports = { getSslCertificates, requestSsl, toggleSsl };
