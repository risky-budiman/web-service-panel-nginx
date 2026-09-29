# 🚀 Task Tracker — Nginx Reverse Proxy Control Panel

> **Tech Stack:** Node.js (Express 5) + Vue.js 3 SPA (Vite) + SQLite (sql.js)  
> **Mulai:** 29 September 2026  
> **Terakhir diupdate:** 29 September 2026

---

## Progress Keseluruhan

| Fase | Progress | Status |
|------|----------|--------|
| Fase 0: Inisialisasi Proyek | 3/3 | ✅ Selesai |
| Fase 1: Backend API Core | 5/5 | ✅ Selesai |
| Fase 2: Sistem Executor & Config Generator | 4/4 | ✅ Selesai |
| Fase 3: Frontend Web UI (Vue.js SPA) | 5/5 | ✅ Selesai |
| Fase 4: Keamanan, SSL & Semua Menu Sidebar | 4/4 | ✅ Selesai |
| **TOTAL** | **21/21** | **🟢 100% Selesai** |

---

## Fase 0: Inisialisasi Proyek

- [x] **0.1** — Membuat struktur folder proyek (backend + frontend)
- [x] **0.2** — Setup backend Node.js (`package.json`) + dependencies (Express, sql.js, JWT, bcrypt)
- [x] **0.3** — Setup Vue.js 3 project dengan Vite + vue-router + axios

**File terkait:**
- `backend/package.json`
- `frontend/package.json`
- `frontend/vite.config.js`

---

## Fase 1: Backend API Core

- [x] **1.1** — Membuat entry point server (`server.js`) dengan routing dasar
- [x] **1.2** — Membuat skema database SQLite + migrasi otomatis
- [x] **1.3** — Membuat model & repository `proxy_hosts` (CRUD ke SQLite)
- [x] **1.4** — Membuat REST API endpoints:
  - `GET /api/proxies` — List semua proxy ✅
  - `POST /api/proxies` — Tambah proxy baru ✅
  - `PUT /api/proxies/:id` — Update proxy ✅
  - `DELETE /api/proxies/:id` — Hapus proxy ✅
  - `PATCH /api/proxies/:id/toggle` — Aktifkan/Nonaktifkan ✅
  - `GET /api/stats` — Statistik dashboard ✅
  - `GET /api/health` — Health check ✅
- [x] **1.5** — Validasi input (format domain, IP privat, port range)

**File terkait:**
- `backend/server.js`
- `backend/db/database.js`
- `backend/models/proxy.js`
- `backend/handlers/proxy_handler.js`
- `backend/middleware/validator.js`

---

## Fase 2: Sistem Executor & Config Generator

- [x] **2.1** — Membuat Nginx config template (HTTP & HTTPS)
- [x] **2.2** — Membuat Config Generator: generate file `.conf` dari data DB
- [x] **2.3** — Membuat System Executor: jalankan `nginx -t` & `systemctl reload nginx`
- [x] **2.4** — Integrasi: API → DB → Generate Config → Test → Reload

**File terkait:**
- `backend/services/config_generator.js`
- `backend/services/system_executor.js`
- `backend/nginx-configs/` (output directory)

---

## Fase 3: Frontend Web UI (Vue.js SPA)

- [x] **3.1** — Setup layout utama (sidebar, header, main content area)
- [x] **3.2** — Halaman Dashboard: tabel daftar proxy + status badge + stats cards
- [x] **3.3** — Form Tambah/Edit Proxy (modal dialog)
- [x] **3.4** — Tombol toggle Aktif/Nonaktif + Hapus dengan konfirmasi
- [x] **3.5** — Notifikasi & error handling (toast notifications)

**File terkait:**
- `frontend/src/App.vue`
- `frontend/src/views/Dashboard.vue`
- `frontend/src/views/Login.vue`
- `frontend/src/components/ProxyForm.vue`
- `frontend/src/components/ConfirmDialog.vue`
- `frontend/src/components/ToastContainer.vue`
- `frontend/src/services/api.js`
- `frontend/src/router/index.js`
- `frontend/src/style.css`

---

## Fase 4: Keamanan, SSL & Semua Menu Sidebar

- [x] **4.1** — Sistem login & autentikasi (JWT) + bcrypt hash
- [x] **4.2** — Middleware auth untuk proteksi seluruh API endpoint
- [x] **4.3** — Menu **🔒 SSL Certificates**: View daftar sertifikat, masa berlaku, dan aktivasi HTTPS/TLS
- [x] **4.4** — Menu **📋 Access Logs**: Real-time Nginx log viewer interaktif dengan pencarian dan filter status (2xx, 4xx, 5xx)
- [x] **4.5** — Menu **⚙️ Settings**: Ubah password admin, monitoring info VPS & Node.js, serta fitur download cadangan `panel.db`
- [x] **4.6** — Siap deploy: Script instalasi otomatis `deploy.sh` & panduan lengkap `DEPLOY_GUIDE.md`

**File terkait:**
- `backend/handlers/auth_handler.js`
- `backend/middleware/auth.js`
- `backend/handlers/ssl_handler.js`
- `backend/handlers/logs_handler.js`
- `backend/handlers/settings_handler.js`
- `frontend/src/views/SslCertificates.vue`
- `frontend/src/views/AccessLogs.vue`
- `frontend/src/views/Settings.vue`
- `deploy.sh`
- `DEPLOY_GUIDE.md`

---

## 📝 Cara Menjalankan

```bash
# Terminal 1 — Backend
cd backend
npm install
node server.js
# Backend berjalan di http://localhost:3000

# Terminal 2 — Frontend (development)
cd frontend
npm install
npx vite --host
# Frontend berjalan di http://localhost:5173

# Default login: admin / admin123
```

## 📦 Deploy ke VPS

Tersedia script deployment otomatis:
```bash
chmod +x deploy.sh
./deploy.sh
```
Atau ikuti panduan lengkap di [`DEPLOY_GUIDE.md`](file:///d:/AI%20Code/web%20service/DEPLOY_GUIDE.md).

