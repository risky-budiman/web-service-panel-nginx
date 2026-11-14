const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDb, closeDb } = require('./db/database');
const { authMiddleware: verifyToken, requirePasswordChanged } = require('./middleware/auth');
const { validateProxyInput } = require('./middleware/validator');
const proxyHandler = require('./handlers/proxy_handler');
const authHandler = require('./handlers/auth_handler');

const app = express();
const PORT = process.env.PORT || 3000;
// HOST=127.0.0.1 → panel hanya bisa diakses lewat Nginx (disarankan, set di .env)
const HOST = process.env.HOST || '0.0.0.0';

// Percayai header X-Forwarded-* hanya dari Nginx di jaringan lokal/privat.
// Klien internet tidak bisa memalsukan IP (penting untuk rate limit login).
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

// Semua route terproteksi: token valid + password default sudah diganti
const authMiddleware = [verifyToken, requirePasswordChanged];

// ─── Middleware Global ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
// Tanpa CORS: frontend dilayani dari origin yang sama, jadi situs lain tidak
// bisa memanggil API panel dari browser korban.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting umum (cukup longgar untuk live monitoring WAF)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT, 10) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request. Coba lagi nanti.' }
});
app.use('/api/', limiter);

// Rate limiting khusus login (anti brute-force): hanya percobaan gagal yang dihitung
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT, 10) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.' }
});

// ─── Static Files (Vue.js build) ────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// ─── API Routes: Auth ───────────────────────────────────────
app.post('/api/auth/login', loginLimiter, authHandler.login);
app.get('/api/auth/me', verifyToken, authHandler.getCurrentUser);

// ─── API Routes: Proxy (Protected) ─────────────────────────
app.get('/api/proxies', authMiddleware, proxyHandler.getAllProxies);
app.get('/api/proxies/:id', authMiddleware, proxyHandler.getProxyById);
app.post('/api/proxies', authMiddleware, validateProxyInput, proxyHandler.createProxy);
app.put('/api/proxies/:id', authMiddleware, validateProxyInput, proxyHandler.updateProxy);
app.delete('/api/proxies/:id', authMiddleware, proxyHandler.deleteProxy);
app.patch('/api/proxies/:id/toggle', authMiddleware, proxyHandler.toggleProxy);
app.post('/api/proxies/:id/toggle', authMiddleware, proxyHandler.toggleProxy);

// ─── API Routes: Stats ──────────────────────────────────────
app.get('/api/stats', authMiddleware, proxyHandler.getStats);

// ─── API Routes: SSL Certificates ───────────────────────────
const sslHandler = require('./handlers/ssl_handler');
app.get('/api/ssl', authMiddleware, sslHandler.getSslCertificates);
app.post('/api/ssl/request', authMiddleware, sslHandler.requestSsl);
app.patch('/api/ssl/:id/toggle', authMiddleware, sslHandler.toggleSsl);
app.post('/api/ssl/:id/toggle', authMiddleware, sslHandler.toggleSsl);

// ─── API Routes: Access Logs ────────────────────────────────
const logsHandler = require('./handlers/logs_handler');
app.get('/api/logs', authMiddleware, logsHandler.getLogs);
app.delete('/api/logs/clear', authMiddleware, logsHandler.clearLogs);

// ─── API Routes: ModSecurity WAF ────────────────────────────
const wafHandler = require('./handlers/waf_handler');
app.get('/api/waf/logs', authMiddleware, wafHandler.getWafLogs);
app.get('/api/waf/stats', authMiddleware, wafHandler.getWafStats);
app.patch('/api/waf/:id/mode', authMiddleware, wafHandler.setWafMode);
app.post('/api/waf/:id/mode', authMiddleware, wafHandler.setWafMode);

// ─── API Routes: Settings & System ──────────────────────────
const settingsHandler = require('./handlers/settings_handler');
app.get('/api/settings/system', authMiddleware, settingsHandler.getSystemInfo);
// Ganti password tetap boleh walau password default belum diganti
app.post('/api/settings/change-password', verifyToken, loginLimiter, settingsHandler.changePassword);
app.get('/api/settings/backup-db', authMiddleware, settingsHandler.backupDatabase);
app.post('/api/settings/restore-db', authMiddleware, express.raw({ type: '*/*', limit: '50mb' }), settingsHandler.restoreDatabase);
app.post('/api/settings/optimize-all', authMiddleware, settingsHandler.optimizeAll);

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Nginx Proxy Panel is running', timestamp: new Date().toISOString() });
});

// ─── SPA Fallback ───────────────────────────────────────────
app.get('{*path}', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      success: true,
      message: '🚀 Nginx Proxy Panel API is running',
      info: 'Frontend belum di-build. Jalankan: cd frontend && npm run build',
      endpoints: {
        health: 'GET /api/health',
        login: 'POST /api/auth/login',
        proxies: 'GET /api/proxies',
        stats: 'GET /api/stats'
      }
    });
  }
});

// ─── Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────
async function startServer() {
  try {
    // Inisialisasi database
    await initDb();
    console.log('✅ Database initialized');

    // Otomatis pastikan optimasi global Nginx dan blokir IP aktif
    const configGen = require('./services/config_generator');
    configGen.generateOptimizationGlobals();
    configGen.generateDefaultCatchAll();

    // Otomatis regenerasi konfigurasi seluruh domain aktif dengan akselerasi terbaru
    try {
      await configGen.regenerateAllConfigs();
    } catch (regenErr) {
      console.warn('⚠️ Gagal regenerasi config saat start:', regenErr.message);
    }

    // Start Express
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║   🖥️  Nginx Proxy Control Panel              ║');
      console.log(`║   🌐 http://${HOST}:${PORT}`);
      console.log('╚══════════════════════════════════════════════╝');
      if (HOST === '0.0.0.0') {
        console.warn('⚠️  Panel terbuka di semua interface. Disarankan HOST=127.0.0.1 dan akses via Nginx + HTTPS.');
      }
      console.log('');
    });
  } catch (err) {
    console.error('❌ Gagal start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

startServer();
