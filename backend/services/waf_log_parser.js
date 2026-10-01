const fs = require('fs');
const readline = require('readline');
const path = require('path');

const AUDIT_LOG_PATH = process.env.MODSEC_AUDIT_LOG || '/var/log/modsec_audit.log';

/**
 * Service untuk membaca dan mem-parse log ModSecurity
 * Mendukung format native ModSecurity v3 (Section A, B, F, H, Z)
 */
class WafLogParser {
  /**
   * Cek apakah file audit log tersedia
   */
  static isLogAvailable() {
    return fs.existsSync(AUDIT_LOG_PATH);
  }

  /**
   * Ambil log serangan WAF
   * @param {Object} options
   * @param {string} options.domain - Filter per domain
   * @param {number} options.limit - Jumlah maksimal log yang dikembalikan (default: 100)
   * @param {string} options.search - Pencarian kata kunci
   */
  static async getLogs({ domain = null, limit = 100, search = null } = {}) {
    if (!this.isLogAvailable()) {
      return {
        available: false,
        message: 'File audit log ModSecurity belum ditemukan di ' + AUDIT_LOG_PATH,
        logs: []
      };
    }

    try {
      const logs = await this.parseAuditLog(AUDIT_LOG_PATH, limit * 2);
      
      let filtered = logs;
      if (domain) {
        filtered = filtered.filter(l => (l.domain || '').toLowerCase().includes(domain.toLowerCase()));
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l => 
          (l.client_ip || '').includes(s) ||
          (l.uri || '').toLowerCase().includes(s) ||
          (l.rule_message || '').toLowerCase().includes(s) ||
          (l.rule_id || '').includes(s)
        );
      }

      return {
        available: true,
        path: AUDIT_LOG_PATH,
        total: filtered.length,
        logs: filtered.slice(0, limit)
      };
    } catch (err) {
      console.error('Error reading WAF log:', err);
      return {
        available: true,
        error: err.message,
        logs: []
      };
    }
  }

  /**
   * Hitung ringkasan statistik WAF (Total serangan, top IP penyerang, top Rules triggered)
   */
  static async getStats() {
    if (!this.isLogAvailable()) {
      return {
        available: false,
        total_attacks: 0,
        top_ips: [],
        top_rules: [],
        top_domains: []
      };
    }

    try {
      const logs = await this.parseAuditLog(AUDIT_LOG_PATH, 500);

      const ipCounts = {};
      const ruleCounts = {};
      const domainCounts = {};

      for (const log of logs) {
        if (log.client_ip) {
          ipCounts[log.client_ip] = (ipCounts[log.client_ip] || 0) + 1;
        }
        if (log.rule_message || log.rule_id) {
          const ruleKey = log.rule_message ? `${log.rule_message} (${log.rule_id})` : `Rule ID ${log.rule_id}`;
          ruleCounts[ruleKey] = (ruleCounts[ruleKey] || 0) + 1;
        }
        if (log.domain) {
          domainCounts[log.domain] = (domainCounts[log.domain] || 0) + 1;
        }
      }

      const sortMap = (map) => Object.entries(map)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        available: true,
        total_attacks: logs.length,
        top_ips: sortMap(ipCounts),
        top_rules: sortMap(ruleCounts),
        top_domains: sortMap(domainCounts)
      };
    } catch (err) {
      return {
        available: true,
        total_attacks: 0,
        error: err.message,
        top_ips: [],
        top_rules: [],
        top_domains: []
      };
    }
  }

  /**
   * Parser internal untuk format section native ModSecurity
   */
  static async parseAuditLog(filePath, maxEntries = 200) {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const entries = [];
    let currentEntry = null;
    let currentSection = null;

    for await (const line of rl) {
      // Header boundary ModSecurity v3: ---OgnNPp1m---A-- atau --OgnNPp1m-A--
      const boundaryMatch = line.match(/^-+([a-zA-Z0-9]+)-+([A-Z])--$/);
      if (boundaryMatch) {
        const entryId = boundaryMatch[1];
        const section = boundaryMatch[2];

        if (section === 'A') {
          // Entry baru dimulai
          currentEntry = {
            id: entryId,
            timestamp: '',
            client_ip: '',
            client_port: '',
            server_ip: '',
            server_port: '',
            method: '',
            uri: '',
            http_version: '',
            domain: '',
            user_agent: '',
            status_code: 403,
            rule_id: '',
            rule_message: '',
            rule_data: '',
            severity: 'WARNING'
          };
          currentSection = 'A';
          continue;
        } else if (section === 'Z') {
          // Entry selesai
          if (currentEntry) {
            entries.push(currentEntry);
          }
          currentEntry = null;
          currentSection = null;
          continue;
        } else {
          currentSection = section;
          continue;
        }
      }

      if (!currentEntry) continue;

      // Section A: Header informasi [timestamp] [unique_id] [client_ip] [client_port] [server_ip] [server_port]
      if (currentSection === 'A') {
        const parts = line.match(/\[(.*?)\]\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)/);
        if (parts) {
          currentEntry.timestamp = parts[1];
          currentEntry.client_ip = parts[3];
          currentEntry.client_port = parts[4];
          currentEntry.server_ip = parts[5];
          currentEntry.server_port = parts[6];
        }
      }
      // Section B: Request headers
      else if (currentSection === 'B') {
        const reqLineMatch = line.match(/^([A-Z]+)\s+(\S+)\s+(HTTP\/[\d\.]+)/i);
        if (reqLineMatch) {
          currentEntry.method = reqLineMatch[1];
          currentEntry.uri = reqLineMatch[2];
          currentEntry.http_version = reqLineMatch[3];
        }
        const hostMatch = line.match(/^host:\s*(\S+)/i);
        if (hostMatch) {
          currentEntry.domain = hostMatch[1].split(':')[0];
        }
        const uaMatch = line.match(/^user-agent:\s*(.*)/i);
        if (uaMatch) {
          currentEntry.user_agent = uaMatch[1];
        }
      }
      // Section F: Response headers
      else if (currentSection === 'F') {
        const statusMatch = line.match(/^HTTP\/[\d\.]+\s+(\d+)/i);
        if (statusMatch) {
          currentEntry.status_code = parseInt(statusMatch[1], 10);
        }
      }
      // Section H atau Section K: Audit log messages (ModSecurity attack rule matches)
      else if (currentSection === 'H' || currentSection === 'K') {
        if (line.includes('Message:') || line.includes('msg "')) {
          const msgMatch = line.match(/Message:\s*(.*?)(?=\s*\[file|\s*$)/) || line.match(/\[msg\s+"(.*?)"\]/);
          if (msgMatch && !currentEntry.rule_message) {
            currentEntry.rule_message = msgMatch[1];
          }
          const idMatch = line.match(/\[id\s+"(\d+)"\]/);
          if (idMatch && !currentEntry.rule_id) {
            currentEntry.rule_id = idMatch[1];
          }
          const sevMatch = line.match(/\[severity\s+"([A-Z]+)"\]/i);
          if (sevMatch && currentEntry.severity === 'WARNING') {
            currentEntry.severity = sevMatch[1].toUpperCase();
          }
          const dataMatch = line.match(/\[data\s+"(.*?)"\]/);
          if (dataMatch && !currentEntry.rule_data) {
            currentEntry.rule_data = dataMatch[1];
          }
        }
      }
    }

    // Urutkan dari yang paling baru
    return entries.reverse();
  }
}

module.exports = WafLogParser;
