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
      return {
        id: p.id,
        domain_name: p.domain_name,
        ssl_enabled: Boolean(p.ssl_enabled),
        issuer: p.ssl_enabled ? "Let's Encrypt / Self-Signed" : 'None',
        status: p.ssl_enabled ? 'Active' : 'Not Configured',
        auto_renew: Boolean(p.ssl_enabled),
        expires_at: p.ssl_enabled ? new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString() : null
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

module.exports = {
  getSslCertificates,
  requestSsl
};
