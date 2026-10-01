const WafLogParser = require('../services/waf_log_parser');
const ProxyModel = require('../models/proxy');
const configGen = require('../services/config_generator');
const systemExec = require('../services/system_executor');

/**
 * GET /api/waf/logs — Ambil log serangan WAF
 */
async function getWafLogs(req, res) {
  try {
    const { domain, limit, search } = req.query;
    const parsedLimit = parseInt(limit, 10) || 50;

    const result = await WafLogParser.getLogs({
      domain: domain || null,
      limit: Math.min(parsedLimit, 200),
      search: search || null
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in getWafLogs:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil log WAF: ' + err.message
    });
  }
}

/**
 * GET /api/waf/stats — Ringkasan statistik serangan WAF
 */
async function getWafStats(req, res) {
  try {
    const stats = await WafLogParser.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('Error in getWafStats:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil statistik WAF: ' + err.message
    });
  }
}

/**
 * PATCH /api/waf/:id/mode — Toggle mode WAF langsung (off / detection / on)
 */
async function setWafMode(req, res) {
  try {
    const { id } = req.params;
    const { waf_mode } = req.body;

    if (!['off', 'detection', 'on'].includes(waf_mode)) {
      return res.status(400).json({
        success: false,
        message: "Mode WAF tidak valid. Gunakan 'off', 'detection', atau 'on'."
      });
    }

    const proxy = ProxyModel.getById(id);
    if (!proxy) {
      return res.status(404).json({
        success: false,
        message: 'Proxy host tidak ditemukan'
      });
    }

    const updated = ProxyModel.update(id, { waf_mode });

    // Regenerate konfigurasi Nginx dan reload
    try {
      configGen.generateConfig(updated);
      await systemExec.reloadNginx();
    } catch (configErr) {
      console.error('WAF config reload warning:', configErr.message);
    }

    res.json({
      success: true,
      message: `WAF untuk ${updated.domain_name} diatur ke mode: ${waf_mode}`,
      data: updated
    });
  } catch (err) {
    console.error('Error in setWafMode:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengubah mode WAF'
    });
  }
}

module.exports = {
  getWafLogs,
  getWafStats,
  setWafMode
};
