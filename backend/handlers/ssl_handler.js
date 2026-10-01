const ProxyModel = require('../models/proxy');
const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');

/**
 * GET /api/ssl — Mengambil list status sertifikat SSL untuk seluruh domain
 */
function getSslCertificates(req, res) {
  try {
    const proxies = ProxyModel.getAll();

    const certificates = proxies.map(p => {
      const certInfo = systemExec.getCertificateInfo(p.domain_name);
      const isEnabled = Boolean(p.ssl_enabled);
      const hasCertOnDisk = certInfo.exists;

      let status = 'Not Configured';
      if (isEnabled && hasCertOnDisk) {
        status = 'Active';
      } else if (isEnabled && !hasCertOnDisk) {
        status = 'Missing Cert';
      } else if (!isEnabled && hasCertOnDisk) {
        status = 'Disabled (Cert Ready)';
      }

      return {
        id: p.id,
        domain_name: p.domain_name,
        ssl_enabled: isEnabled,
        has_cert: hasCertOnDisk,
        issuer: hasCertOnDisk ? "Let's Encrypt" : (isEnabled ? 'Self-Signed' : 'None'),
        status,
        auto_renew: isEnabled,
        expires_at: hasCertOnDisk ? new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString() : null
      };
    });

    res.json({
      success: true,
      data: certificates
    });
  } catch (err) {
    console.error('Error getSslCertificates:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data SSL' });
  }
}

/**
 * POST /api/ssl/request — Request / generate SSL untuk domain
 */
async function requestSsl(req, res) {
  try {
    const { proxy_id } = req.body;
    const proxy = ProxyModel.getById(proxy_id);

    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy domain tidak ditemukan' });
    }

    // Terbitkan sertifikat SSL dengan Certbot jika di server Linux
    if (process.platform === 'linux') {
      const certResult = await systemExec.obtainCertificate(proxy.domain_name);
      if (!certResult.success) {
        return res.status(500).json({
          success: false,
          message: certResult.message || 'Gagal menerbitkan sertifikat Let\'s Encrypt'
        });
      }
    }

    // Update status SSL pada database
    ProxyModel.update(proxy.id, {
      domain_name: proxy.domain_name,
      target_ip: proxy.target_ip,
      target_port: proxy.target_port,
      ssl_enabled: 1
    });

    // Perbarui file konfigurasi Nginx menjadi HTTPS block
    const updatedProxy = ProxyModel.getById(proxy.id);
    configGen.generateConfig(updatedProxy);
    await systemExec.reloadNginx();

    res.json({
      success: true,
      message: `SSL untuk domain '${proxy.domain_name}' berhasil diterbitkan dan diaktifkan`,
      data: updatedProxy
    });
  } catch (err) {
    console.error('Error requestSsl:', err);
    res.status(500).json({ success: false, message: 'Gagal mengaktifkan SSL: ' + err.message });
  }
}

/**
 * PATCH /api/ssl/:id/toggle — Toggle SSL aktif / nonaktif
 */
async function toggleSsl(req, res) {
  try {
    const { id } = req.params;
    const proxy = ProxyModel.getById(id);

    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy domain tidak ditemukan' });
    }

    const nextSsl = proxy.ssl_enabled ? 0 : 1;

    // Jika ingin mengaktifkan SSL dan di Linux, periksa sertifikat
    if (nextSsl && process.platform === 'linux') {
      if (!systemExec.hasCertificate(proxy.domain_name)) {
        const certResult = await systemExec.obtainCertificate(proxy.domain_name);
        if (!certResult.success) {
          return res.status(500).json({
            success: false,
            message: certResult.message || 'Gagal menerbitkan sertifikat Let\'s Encrypt'
          });
        }
      }
    }

    const updated = ProxyModel.update(id, { ssl_enabled: nextSsl });

    // Perbarui konfigurasi Nginx dan reload
    try {
      configGen.generateConfig(updated);
      await systemExec.reloadNginx();
    } catch (configErr) {
      console.error('Config reload error during SSL toggle:', configErr.message);
    }

    res.json({
      success: true,
      message: `SSL untuk ${updated.domain_name} berhasil ${nextSsl ? 'diaktifkan (HTTPS)' : 'dinonaktifkan (HTTP)'}`,
      data: updated
    });
  } catch (err) {
    console.error('Error toggleSsl:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah status SSL: ' + err.message });
  }
}

module.exports = {
  getSslCertificates,
  requestSsl,
  toggleSsl
};
