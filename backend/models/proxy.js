const { getDb, saveDb, runAndSave, queryAll, queryOne } = require('../db/database');

class ProxyModel {
  /**
   * Ambil semua proxy hosts
   */
  /**
   * Ambil semua proxy hosts
   */
  static getAll() {
    return queryAll(`
      SELECT id, domain_name, target_ip, target_port, ssl_enabled, waf_mode, status, created_at, updated_at
      FROM proxy_hosts
      ORDER BY created_at DESC
    `);
  }

  /**
   * Ambil proxy by ID
   */
  static getById(id) {
    return queryOne('SELECT * FROM proxy_hosts WHERE id = ?', [id]);
  }

  /**
   * Ambil proxy by domain name
   */
  static getByDomain(domainName) {
    return queryOne('SELECT * FROM proxy_hosts WHERE domain_name = ?', [domainName]);
  }

  /**
   * Buat proxy baru
   */
  static create({ domain_name, target_ip, target_port, ssl_enabled = false, waf_mode = 'off' }) {
    const db = getDb();
    const validWaf = ['off', 'detection', 'on'].includes(waf_mode) ? waf_mode : 'off';
    db.run(
      `INSERT INTO proxy_hosts (domain_name, target_ip, target_port, ssl_enabled, waf_mode, status) VALUES (?, ?, ?, ?, ?, 'active')`,
      [domain_name, target_ip, target_port, ssl_enabled ? 1 : 0, validWaf]
    );
    saveDb();

    // Ambil proxy yang baru dibuat berdasarkan domain
    return this.getByDomain(domain_name);
  }

  /**
   * Update proxy
   */
  static update(id, { domain_name, target_ip, target_port, ssl_enabled, waf_mode }) {
    const fields = [];
    const values = [];

    if (domain_name !== undefined) { fields.push('domain_name = ?'); values.push(domain_name); }
    if (target_ip !== undefined) { fields.push('target_ip = ?'); values.push(target_ip); }
    if (target_port !== undefined) { fields.push('target_port = ?'); values.push(target_port); }
    if (ssl_enabled !== undefined) { fields.push('ssl_enabled = ?'); values.push(ssl_enabled ? 1 : 0); }
    if (waf_mode !== undefined && ['off', 'detection', 'on'].includes(waf_mode)) {
      fields.push('waf_mode = ?'); values.push(waf_mode);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    runAndSave(`UPDATE proxy_hosts SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getById(id);
  }

  /**
   * Toggle status active/inactive
   */
  static toggleStatus(id) {
    const proxy = this.getById(id);
    if (!proxy) return null;

    const newStatus = proxy.status === 'active' ? 'inactive' : 'active';
    runAndSave('UPDATE proxy_hosts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, id]);

    return this.getById(id);
  }

  /**
   * Set status error
   */
  static setError(id) {
    runAndSave("UPDATE proxy_hosts SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    return this.getById(id);
  }

  /**
   * Hapus proxy
   */
  static delete(id) {
    const proxy = this.getById(id);
    if (!proxy) return null;

    runAndSave('DELETE FROM proxy_hosts WHERE id = ?', [id]);
    return proxy;
  }

  /**
   * Hitung total proxy
   */
  static count() {
    const result = queryOne('SELECT COUNT(*) as total FROM proxy_hosts');
    return result ? result.total : 0;
  }

  /**
   * Statistik
   */
  static getStats() {
    const total = this.count();
    const active = queryOne("SELECT COUNT(*) as c FROM proxy_hosts WHERE status = 'active'")?.c || 0;
    const inactive = queryOne("SELECT COUNT(*) as c FROM proxy_hosts WHERE status = 'inactive'")?.c || 0;
    const error = queryOne("SELECT COUNT(*) as c FROM proxy_hosts WHERE status = 'error'")?.c || 0;
    const sslEnabled = queryOne("SELECT COUNT(*) as c FROM proxy_hosts WHERE ssl_enabled = 1")?.c || 0;
    const wafActive = queryOne("SELECT COUNT(*) as c FROM proxy_hosts WHERE waf_mode IN ('on', 'detection')")?.c || 0;

    return { total, active, inactive, error, ssl_enabled: sslEnabled, waf_active: wafActive };
  }
}

module.exports = ProxyModel;
