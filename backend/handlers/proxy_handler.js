const ProxyModel = require('../models/proxy');
const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');

/**
 * GET /api/proxies — List semua proxy
 */
function getAllProxies(req, res) {
  try {
    const proxies = ProxyModel.getAll();
    const stats = ProxyModel.getStats();

    res.json({
      success: true,
      data: proxies,
      stats
    });
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
    const { domain_name, target_ip, target_port, ssl_enabled } = req.body;

    // Cek duplikat domain
    const existing = ProxyModel.getByDomain(domain_name);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Domain '${domain_name}' sudah terdaftar`
      });
    }

    const proxy = ProxyModel.create({ domain_name, target_ip, target_port, ssl_enabled });

    // Generate nginx config
    try {
      configGen.generateConfig(proxy);
      const result = await systemExec.reloadNginx();
      if (!result.success && !result.skipped) {
        ProxyModel.setError(proxy.id);
      }
    } catch (configErr) {
      console.error('Config generation warning:', configErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Proxy berhasil ditambahkan',
      data: proxy
    });
  } catch (err) {
    console.error('Error creating proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal menambahkan proxy' });
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

    const { domain_name, target_ip, target_port, ssl_enabled } = req.body;

    // Cek duplikat domain (jika domain berubah)
    if (domain_name && domain_name !== existing.domain_name) {
      const duplicate = ProxyModel.getByDomain(domain_name);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Domain '${domain_name}' sudah digunakan oleh proxy lain`
        });
      }
      // Hapus config lama jika domain berubah
      configGen.removeConfig(existing.domain_name);
    }

    const proxy = ProxyModel.update(req.params.id, { domain_name, target_ip, target_port, ssl_enabled });

    // Re-generate nginx config
    try {
      configGen.generateConfig(proxy);
      await systemExec.reloadNginx();
    } catch (configErr) {
      console.error('Config generation warning:', configErr.message);
    }

    res.json({
      success: true,
      message: 'Proxy berhasil diperbarui',
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
    const proxy = ProxyModel.delete(req.params.id);
    if (!proxy) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }

    // Hapus nginx config file
    try {
      configGen.removeConfig(proxy.domain_name);
      await systemExec.reloadNginx();
    } catch (configErr) {
      console.error('Config removal warning:', configErr.message);
    }

    res.json({
      success: true,
      message: `Proxy '${proxy.domain_name}' berhasil dihapus`,
      data: proxy
    });
  } catch (err) {
    console.error('Error deleting proxy:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus proxy' });
  }
}

/**
 * PATCH /api/proxies/:id/toggle — Toggle aktif/nonaktif
 */
async function toggleProxy(req, res) {
  try {
    const before = ProxyModel.getById(req.params.id);
    if (!before) {
      return res.status(404).json({ success: false, message: 'Proxy tidak ditemukan' });
    }

    const proxy = ProxyModel.toggleStatus(req.params.id);

    // Enable/disable nginx config
    try {
      if (proxy.status === 'inactive') {
        configGen.disableConfig(proxy.domain_name);
      } else {
        configGen.enableConfig(proxy.domain_name);
        if (!configGen.configExists(proxy.domain_name)) {
          configGen.generateConfig(proxy);
        }
      }
      await systemExec.reloadNginx();
    } catch (configErr) {
      console.error('Config toggle warning:', configErr.message);
    }

    res.json({
      success: true,
      message: `Proxy '${proxy.domain_name}' sekarang ${proxy.status}`,
      data: proxy
    });
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
    const stats = ProxyModel.getStats();
    res.json({ success: true, data: stats });
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
  getStats
};
