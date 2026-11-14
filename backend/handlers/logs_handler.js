const fs = require('fs');
const path = require('path');
const ProxyModel = require('../models/proxy');
const { isValidDomain } = require('../middleware/validator');

// Hanya baca bagian akhir file log (hindari memuat file ratusan MB ke memori)
const TAIL_BYTES = 2 * 1024 * 1024;

function readTailLines(filePath, maxLines) {
  const { size } = fs.statSync(filePath);
  const start = Math.max(0, size - TAIL_BYTES);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  let lines = buffer.toString('utf8').split('\n');
  if (start > 0) lines = lines.slice(1); // baris pertama kemungkinan terpotong
  return lines.filter(line => line.trim().length > 0).slice(-maxLines).reverse();
}

/**
 * Resolve path log untuk domain. Domain harus terdaftar di panel, sehingga
 * parameter tidak bisa dipakai untuk membaca / mengosongkan file lain.
 * Mengembalikan null bila domain tidak valid.
 */
function resolveLogPath(domain) {
  if (!domain) return path.join(LOG_DIR, 'access.log');
  const clean = String(domain).trim().toLowerCase();
  if (!isValidDomain(clean) || !ProxyModel.getByDomain(clean)) return null;
  return path.join(LOG_DIR, `${clean}.access.log`);
}

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
    const maxLines = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const logFilePath = resolveLogPath(domain);
    if (!logFilePath) {
      return res.status(400).json({ success: false, message: 'Domain tidak terdaftar di panel' });
    }

    const rawLines = fs.existsSync(logFilePath) ? readTailLines(logFilePath, maxLines) : [];

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
      available: fs.existsSync(logFilePath),
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
    const { domain } = req.body || {};
    const logFilePath = resolveLogPath(domain);
    if (!logFilePath) {
      return res.status(400).json({ success: false, message: 'Domain tidak terdaftar di panel' });
    }

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
