/**
 * Middleware untuk validasi input proxy
 */

// Regex pattern untuk validasi
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const PRIVATE_IP_REGEX = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3})|(127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

function validateProxyInput(req, res, next) {
  const { domain_name, target_ip, target_port } = req.body;
  const errors = [];

  // Validasi domain
  if (!domain_name || typeof domain_name !== 'string') {
    errors.push('Domain name wajib diisi');
  } else if (!DOMAIN_REGEX.test(domain_name.trim())) {
    errors.push('Format domain tidak valid (contoh: app.example.com)');
  }

  // Validasi IP
  if (!target_ip || typeof target_ip !== 'string') {
    errors.push('Target IP wajib diisi');
  } else if (!PRIVATE_IP_REGEX.test(target_ip.trim())) {
    errors.push('Target IP harus berupa IP privat (10.x.x.x, 172.16-31.x.x, 192.168.x.x, atau 127.x.x.x)');
  }

  // Validasi Port
  if (target_port === undefined || target_port === null || target_port === '') {
    errors.push('Target port wajib diisi');
  } else {
    const port = parseInt(target_port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port harus berupa angka antara 1-65535');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validasi gagal',
      errors
    });
  }

  // Sanitize input
  req.body.domain_name = domain_name.trim().toLowerCase();
  req.body.target_ip = target_ip.trim();
  req.body.target_port = parseInt(target_port, 10);

  next();
}

module.exports = { validateProxyInput };
