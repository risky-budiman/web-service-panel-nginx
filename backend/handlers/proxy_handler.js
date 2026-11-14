const ProxyModel = require('../models/proxy');
const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');

/**
 * Respons standar ketika Nginx menolak konfigurasi baru.
 * Perubahan database sudah dibatalkan oleh pemanggil.
 */
function configRejected(res, applyResult) {
  return res.status(422).json({
    success: false,
    message: applyResult.message || 'Nginx menolak konfigurasi. Perubahan dibatalkan.',
    nginx_output: applyResult.output || undefined
  });
}

/**
 * Terbitkan sertifikat Let's Encrypt otomatis bila SSL diminta dan belum ada.
 * Config HTTP sementara dipasang agar challenge Certbot bisa diverifikasi.
 * Mengembalikan pesan peringatan (string) bila gagal, atau null.
 */
async function ensureCertificate(proxy) {
  if (!proxy.ssl_enabled || !systemExec.systemCommandsEnabled) return null;
  if (systemExec.hasCertificate(proxy.domain_name)) return null;

  console.log(`🔐 Mengambil sertifikat SSL otomatis untuk ${proxy.domain_name}...`);
  const tmp = await configGen.applyConfigChange([proxy.domain_name], () => {
    configGen.generateConfig({ ...proxy, ssl_enabled: 0 });
  });
  if (!tmp.success) return `Config HTTP sementara ditolak Nginx: ${tmp.message}`;

  const certResult = await systemExec.obtainCertificate(proxy.domain_name);
  if (!certResult.success) {
    console.warn(`⚠️ Certbot gagal untuk ${proxy.domain_name}: ${certResult.message}`);
    return 'Sertifikat SSL gagal diterbitkan, domain sementara berjalan di HTTP';
  }
  return null;
}

/**
 * GET /api/proxies — List semua proxy
 */
function getAllProxies(req, res) {
  try {
    res.json({ success: true, data: ProxyModel.getAll(), stats: ProxyModel.getStats() });
  } catch (err) {
    console.error('Error getting proxies:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data proxy' });
  }
}

/**
 * GET /api/proxies/:id — Detail proxy
 */
function getProxyById(req, res) {
  try {
    const proxy = ProxyModel.getById(req.params.id);
    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }
    res.json({ success: true, data: proxy });
  } catch (err) {
    console.error('Error getting proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data proxy' });
  }
}

/**
 * POST /api/proxies — Tambah proxy baru
 */
async function createProxy(req, res) {
  try {
    const { domain_name, target_ip, target_port, ssl_enabled, waf_mode } = req.body;

    if (ProxyModel.getByDomain(domain_name)) {
      return res.status(409).json({ success: false, message: `Domain '${domain_name}' sudah terdaftar` });
    }

    const proxy = ProxyModel.create({ domain_name, target_ip, target_port, ssl_enabled, waf_mode });
    const sslWarning = await ensureCertificate(proxy);

    const applied = await configGen.applyConfigChange([proxy.domain_name], () => {
      configGen.generateConfig(proxy);
    });
    if (!applied.success) {
      ProxyModel.delete(proxy.id);
      return configRejected(res, applied);
    }

    res.status(201).json({
      success: true,
      message: 'Proxy berhasil ditambahkan' + (sslWarning ? ` (${sslWarning})` : proxy.ssl_enabled ? ' dan SSL otomatis diaktifkan' : ''),
      data: proxy
    });
  } catch (err) {
    console.error('Error creating proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses proxy' });
  }
}

/**
 * PUT /api/proxies/:id — Update proxy
 */
async function updateProxy(req, res) {
  try {
    const existing = ProxyModel.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }

    const { domain_name, target_ip, target_port, ssl_enabled, waf_mode } = req.body;
    const domainChanged = domain_name && domain_name !== existing.domain_name;

    if (domainChanged && ProxyModel.getByDomain(domain_name)) {
      return res.status(409).json({ success: false, message: `Domain '${domain_name}' sudah digunakan oleh proxy lain` });
    }

    const proxy = ProxyModel.update(req.params.id, { domain_name, target_ip, target_port, ssl_enabled, waf_mode });
    const sslWarning = await ensureCertificate(proxy);

    const applied = await configGen.applyConfigChange([existing.domain_name, proxy.domain_name], () => {
      if (domainChanged) configGen.removeConfig(existing.domain_name);
      configGen.writeProxyConfig(proxy);
    });
    if (!applied.success) {
      ProxyModel.restore(existing);
      return configRejected(res, applied);
    }

    res.json({
      success: true,
      message: 'Proxy berhasil diperbarui' + (sslWarning ? ` (${sslWarning})` : proxy.ssl_enabled ? ' dan SSL otomatis diaktifkan' : ''),
      data: proxy
    });
  } catch (err) {
    console.error('Error updating proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui proxy' });
  }
}

/**
 * DELETE /api/proxies/:id — Hapus proxy
 */
async function deleteProxy(req, res) {
  try {
    const proxy = ProxyModel.getById(req.params.id);
    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }

    const applied = await configGen.applyConfigChange([proxy.domain_name], () => {
      configGen.removeConfig(proxy.domain_name);
    });
    if (!applied.success) {
      return configRejected(res, applied);
    }

    ProxyModel.delete(proxy.id);

    res.json({ success: true, message: `Proxy '${proxy.domain_name}' berhasil dihapus`, data: proxy });
  } catch (err) {
    console.error('Error deleting proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus proxy' });
  }
}

/**
 * PATCH|POST /api/proxies/:id/toggle — Toggle aktif/nonaktif
 */
async function toggleProxy(req, res) {
  try {
    const before = ProxyModel.getById(req.params.id);
    if (!before) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }

    const proxy = ProxyModel.toggleStatus(req.params.id);

    const applied = await configGen.applyConfigChange([proxy.domain_name], () => {
      if (proxy.status === 'inactive') {
        configGen.disableConfig(proxy.domain_name);
      } else {
        configGen.enableConfig(proxy.domain_name);
        configGen.generateConfig(proxy);
      }
    });
    if (!applied.success) {
      ProxyModel.restore(before);
      return configRejected(res, applied);
    }

    res.json({ success: true, message: `Proxy '${proxy.domain_name}' sekarang ${proxy.status}`, data: proxy });
  } catch (err) {
    console.error('Error toggling proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah status proxy' });
  }
}

/**
 * GET /api/stats — Statistik dashboard
 */
function getStats(req, res) {
  try {
    res.json({ success: true, data: ProxyModel.getStats() });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil statistik' });
  }
}

module.exports = {
  getAllProxies,
  getProxyById,
  createProxy,
  updateProxy,
  deleteProxy,
  toggleProxy,
  getStats,
  configRejected
};
