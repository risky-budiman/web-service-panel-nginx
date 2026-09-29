const fs = require('fs');
const path = require('path');

// Direktori log Nginx
// Di Linux: /var/log/nginx/
// Di Windows / Dev: ./backend/logs/ (atau fallback sample)
const LOG_DIR = process.env.NGINX_LOG_DIR || (process.platform === 'linux' ? '/var/log/nginx' : path.join(__dirname, '..', 'logs'));

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * GET /api/logs — Mengambil log akses Nginx terbaru
 */
function getLogs(req, res) {
  try {
    const { domain, limit = 100 } = req.query;
    const maxLines = Math.min(parseInt(limit) || 100, 500);

    let logFilePath = '';

    if (domain) {
      logFilePath = path.join(LOG_DIR, `${domain}.access.log`);
    } else {
      // General access.log
      logFilePath = path.join(LOG_DIR, 'access.log');
    }

    let rawLines = [];

    if (fs.existsSync(logFilePath)) {
      const content = fs.readFileSync(logFilePath, 'utf8');
      rawLines = content.split('\n').filter(line => line.trim().length > 0);
      rawLines = rawLines.slice(-maxLines).reverse();
    } else {
      // Coba cari semua log yang ada di folder LOG_DIR
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
      if (files.length > 0) {
        const firstFile = path.join(LOG_DIR, files[0]);
        const content = fs.readFileSync(firstFile, 'utf8');
        rawLines = content.split('\n').filter(line => line.trim().length > 0).slice(-maxLines).reverse();
      } else {
        // Mock sample logs untuk environment non-linux / belum ada traffic
        const now = new Date();
        rawLines = [
          `127.0.0.1 - - [${now.toUTCString()}] "GET /api/stats HTTP/1.1" 200 412 "-" "Mozilla/5.0"`,
          `127.0.0.1 - - [${now.toUTCString()}] "GET /api/proxies HTTP/1.1" 200 1204 "-" "Mozilla/5.0"`,
          `192.168.1.105 - - [${now.toUTCString()}] "GET / HTTP/1.1" 200 5231 "-" "Chrome/124.0"`,
          `192.168.1.200 - - [${now.toUTCString()}] "POST /api/auth/login HTTP/1.1" 200 185 "-" "NginxPanel/1.0"`
        ];
      }
    }

    // Parse baris log standar Nginx
    const parsedLogs = rawLines.map((line, idx) => {
      // Regex Nginx combined format
      // 127.0.0.1 - - [timestamp] "METHOD /url HTTP/1.1" status bytes "referer" "user_agent"
      const match = line.match(/^(\S+) \S+ \S+ \[(.*?)\] "(\S+) (\S+) \S+" (\d{3}) (\d+)/);
      if (match) {
        return {
          id: idx + 1,
          ip: match[1],
          time: match[2],
          method: match[3],
          path: match[4],
          status: parseInt(match[5]),
          size: parseInt(match[6]),
          raw: line
        };
      }
      return {
        id: idx + 1,
        ip: '-',
        time: new Date().toLocaleTimeString(),
        method: 'INFO',
        path: '-',
        status: 200,
        size: 0,
        raw: line
      };
    });

    res.json({
      success: true,
      data: parsedLogs,
      log_file: logFilePath,
      total: parsedLogs.length
    });
  } catch (err) {
    console.error('Error getLogs:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil log akses' });
  }
}

/**
 * DELETE /api/logs/clear — Hapus isi file log
 */
function clearLogs(req, res) {
  try {
    const { domain } = req.body;
    let logFilePath = domain ? path.join(LOG_DIR, `${domain}.access.log`) : path.join(LOG_DIR, 'access.log');

    if (fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '');
    }

    res.json({ success: true, message: 'Log berhasil dibersihkan' });
  } catch (err) {
    console.error('Error clearLogs:', err);
    res.status(500).json({ success: false, message: 'Gagal membersihkan log' });
  }
}

module.exports = {
  getLogs,
  clearLogs
};
