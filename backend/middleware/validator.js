/**
 * Validasi input proxy.
 *
 * Nilai-nilai ini ditulis langsung ke file konfigurasi Nginx, jadi validasinya
 * harus ketat (whitelist) agar tidak ada karakter seperti ; { } spasi atau
 * baris baru yang bisa menyisipkan direktif Nginx.
 */
const net = require('net');

const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VALID_WAF_MODES = ['off', 'detection', 'on'];

function isValidDomain(value) {
  return typeof value === 'string' && DOMAIN_REGEX.test(value);
}

/**
 * IPv4 privat / loopback: 10/8, 172.16/12, 192.168/16, 127/8.
 * Menggunakan net.isIPv4 sehingga hanya alamat IPv4 utuh yang diterima.
 */
function isPrivateIPv4(value) {
  if (typeof value !== 'string' || !net.isIPv4(value)) return false;
  const [a, b] = value.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function parsePort(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{1,5}$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

function validateProxyInput(req, res, next) {
  const body = req.body || {};
  const errors = [];

  const domain = typeof body.domain_name === 'string' ? body.domain_name.trim().toLowerCase() : '';
  let targetIp = typeof body.target_ip === 'string' ? body.target_ip.trim() : '';
  if (targetIp.toLowerCase() === 'localhost') targetIp = '127.0.0.1';
  const port = parsePort(body.target_port);

  if (!domain) {
    errors.push('Domain name wajib diisi');
  } else if (!isValidDomain(domain)) {
    errors.push('Format domain tidak valid (contoh: app.example.com)');
  }

  if (!targetIp) {
    errors.push('Target IP wajib diisi');
  } else if (!isPrivateIPv4(targetIp)) {
    errors.push('Target IP harus berupa IPv4 privat (10.x.x.x, 172.16-31.x.x, 192.168.x.x, atau 127.x.x.x)');
  }

  if (body.target_port === undefined || body.target_port === null || body.target_port === '') {
    errors.push('Target port wajib diisi');
  } else if (!isValidPort(port)) {
    errors.push('Port harus berupa angka antara 1-65535');
  }

  if (body.waf_mode !== undefined && !VALID_WAF_MODES.includes(body.waf_mode)) {
    errors.push("Mode WAF tidak valid. Gunakan 'off', 'detection', atau 'on'.");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validasi gagal', errors });
  }

  req.body.domain_name = domain;
  req.body.target_ip = targetIp;
  req.body.target_port = port;
  if (body.ssl_enabled !== undefined) req.body.ssl_enabled = Boolean(body.ssl_enabled);

  next();
}

module.exports = {
  validateProxyInput,
  isValidDomain,
  isPrivateIPv4,
  isValidPort,
  VALID_WAF_MODES
};
