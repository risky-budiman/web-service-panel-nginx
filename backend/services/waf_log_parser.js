const fs = require('fs');
const readline = require('readline');
const path = require('path');

const AUDIT_LOG_PATH = process.env.MODSEC_AUDIT_LOG || '/var/log/modsec_audit.log';
const WAF_TAIL_BYTES = (parseInt(process.env.WAF_TAIL_MB, 10) || 20) * 1024 * 1024;

// Level syslog yang dipakai ModSecurity / OWASP CRS (angka kecil = lebih parah)
const SEVERITY_NAMES = ['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG'];
const SEVERITY_RANK = Object.fromEntries(SEVERITY_NAMES.map((name, i) => [name, i]));

// Rule evaluasi skor anomali CRS (949xxx inbound, 959xxx outbound, 980xxx korelasi)
// hanya "akibat" dari rule lain, jadi bukan kandidat rule utama.
function isScoringRule(id) {
  return /^(949|959|980)\d{3}$/.test(id || '');
}

/**
 * Tentukan rule utama sebuah entri: rule deteksi (bukan scoring) dengan severity
 * paling parah. Severity entri = severity paling parah dari semua rule.
 */
function finalizeEntry(entry) {
  const rules = entry.rules;
  if (rules.length > 0) {
    const bySeverity = (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    const detection = rules.filter(r => !isScoringRule(r.id));
    const primary = [...(detection.length ? detection : rules)].sort(bySeverity)[0];
    entry.rule_id = primary.id;
    entry.rule_message = primary.message;
    entry.rule_data = primary.data || (rules.find(r => r.data) || {}).data || '';
    entry.severity = [...rules].sort(bySeverity)[0].severity;
  }
  entry.is_attack = Boolean(entry.rule_id || entry.rule_message);
  return entry;
}

function normalizeSeverity(value) {
  if (/^\d$/.test(value)) return SEVERITY_NAMES[Number(value)] || null;
  const name = value.toUpperCase();
  return name in SEVERITY_RANK ? name : null;
}

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
    * Ambil log WAF
   * @param {Object} options
   * @param {string} options.domain - Filter per domain
   * @param {number} options.limit - Jumlah maksimal log yang dikembalikan (default: 100)
   * @param {string} options.search - Pencarian kata kunci
   * @param {string} options.filter - 'all' | 'attacks' | 'non_attacks' | 'blocked'
   */
  static async getLogs({ domain = null, limit = 100, search = null, filter = 'all' } = {}) {
    if (!this.isLogAvailable()) {
      return {
        available: false,
        message: 'File audit log ModSecurity belum ditemukan di ' + AUDIT_LOG_PATH,
        logs: []
      };
    }

    try {
      const logs = await this.parseAuditLog(AUDIT_LOG_PATH, limit * 3);
      
      let filtered = logs;
      
      // Filter serangan vs non-serangan
      if (filter === 'attacks') {
        filtered = filtered.filter(l => l.is_attack);
      } else if (filter === 'non_attacks') {
        filtered = filtered.filter(l => !l.is_attack);
      } else if (filter === 'blocked') {
        filtered = filtered.filter(l => l.status_code === 403);
      }

      if (domain) {
        filtered = filtered.filter(l => (l.domain || '').toLowerCase().includes(domain.toLowerCase()));
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l => 
          (l.client_ip || '').includes(s) ||
          (l.uri || '').toLowerCase().includes(s) ||
          (l.domain || '').toLowerCase().includes(s) ||
          (l.rules || []).some(r => r.id.includes(s) || r.message.toLowerCase().includes(s))
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
   * Hitung ringkasan statistik WAF (Total serangan nyata, top IP penyerang, top Rules triggered)
   */
  static async getStats() {
    if (!this.isLogAvailable()) {
      return {
        available: false,
        total_attacks: 0,
        total_blocked: 0,
        total_audit: 0,
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
      let totalAttacks = 0;
      let totalBlocked = 0;

      for (const log of logs) {
        if (log.is_attack) {
          totalAttacks++;
          if (log.client_ip) {
            ipCounts[log.client_ip] = (ipCounts[log.client_ip] || 0) + 1;
          }
          // Hitung setiap rule deteksi yang terpicu (sekali per request), tanpa rule skor anomali
          const seen = new Set();
          for (const rule of log.rules || []) {
            if (isScoringRule(rule.id) || seen.has(rule.id)) continue;
            seen.add(rule.id);
            const ruleKey = rule.message ? `${rule.message} (${rule.id})` : `Rule ID ${rule.id}`;
            ruleCounts[ruleKey] = (ruleCounts[ruleKey] || 0) + 1;
          }
          if (log.domain) {
            domainCounts[log.domain] = (domainCounts[log.domain] || 0) + 1;
          }
        }
        if (log.status_code === 403) {
          totalBlocked++;
        }
      }

      const sortMap = (map) => Object.entries(map)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        available: true,
        total_attacks: totalAttacks,
        total_blocked: totalBlocked,
        total_audit: logs.length,
        top_ips: sortMap(ipCounts),
        top_rules: sortMap(ruleCounts),
        top_domains: sortMap(domainCounts)
      };
    } catch (err) {
      return {
        available: true,
        total_attacks: 0,
        total_blocked: 0,
        total_audit: 0,
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
    // Hanya baca bagian akhir file. Entri pertama yang terpotong otomatis
    // diabaikan karena parser baru mulai mencatat setelah boundary section A.
    const { size } = fs.statSync(filePath);
    const start = Math.max(0, size - WAF_TAIL_BYTES);
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8', start });
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
            severity: 'WARNING',
            rules: [],
            is_attack: false
          };
          currentSection = 'A';
          continue;
        } else if (section === 'Z') {
          // Entry selesai
          if (currentEntry) {
            finalizeEntry(currentEntry);
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
        // Satu baris = satu rule yang terpicu. Kumpulkan semuanya; rule utama
        // dipilih saat entri selesai (lihat finalizeEntry).
        if (line.includes('Message:') || line.includes('msg "') || line.includes('[id "')) {
          const msgMatch = line.match(/\[msg\s+"(.*?)"\]/) || line.match(/Message:\s*(.*?)(?=\s*\[file|\s*$)/);
          const idMatch = line.match(/\[id\s+"(\d+)"\]/);
          const sevMatch = line.match(/\[severity\s+"([A-Za-z]+|\d)"\]/);
          const dataMatch = line.match(/\[data\s+"(.*?)"\]/);
          if (idMatch || msgMatch) {
            currentEntry.rules.push({
              id: idMatch ? idMatch[1] : '',
              message: msgMatch ? msgMatch[1] : '',
              // ModSecurity v3 menulis severity sebagai angka syslog ("2") atau nama ("CRITICAL")
              severity: (sevMatch && normalizeSeverity(sevMatch[1])) || 'WARNING',
              data: dataMatch ? dataMatch[1] : ''
            });
          }
        }
      }
    }

    // Urutkan dari yang paling baru
    return entries.reverse();
  }
}

module.exports = WafLogParser;
