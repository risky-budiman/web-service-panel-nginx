# 🖥️ Nginx Reverse Proxy Control Panel

Web control panel modern dan ringan berbasis **Node.js (Express 5)**, **Vue.js 3 SPA**, dan **SQLite (sql.js)** untuk mengelola proxy host Nginx, domain routing, SSL certificates, dan access logs secara visual dan mudah.

---

## 🚀 Fitur Utama
- **Dashboard Proxy:** Kelola proxy host (CRUD: Create, Read, Update, Delete) dan toggle aktif/nonaktif dalam 1 klik.
- **Generator Nginx Otomatis:** Menulis dan menghapus file `.conf` Nginx secara terisolasi tanpa merusak konfigurasi sistem utama.
- **SSL / TLS Manager:** Monitoring masa aktif sertifikat HTTPS dan aktivasi SSL Let's Encrypt / Certbot.
- **Real-time Access Logs:** Log viewer interaktif dengan pencarian cepat dan pemfilteran kode status HTTP (2xx, 4xx, 5xx).
- **Keamanan:** Autentikasi JWT, bcrypt, wajib ganti password default, rate limit login, validasi input ketat, backup & restore `panel.db` tervalidasi.
- **WAF ModSecurity + OWASP CRS:** Mode Off / Detection / Enforce per domain dengan monitoring serangan real-time.
- **Dukungan Domain Sendiri:** Web panel ini dapat diakses langsung menggunakan domain/subdomain pribadi (contoh: `https://panel.domainanda.com`).

---

## 📚 Dokumentasi Panduan
1. [**Panduan Lengkap Ubuntu & Domain Setup**](PANDUAN_UBUNTU_DAN_DOMAIN.md) — Langkah instalasi library lengkap pada Ubuntu dari nol hingga memasang domain & HTTPS.
2. [**Panduan Deployment VPS (PM2 & Script Otomatis)**](DEPLOY_GUIDE.md) — Panduan cepat deployment menggunakan `deploy.sh` atau manual.
3. [**Update Aman di Server Produksi**](DEPLOY_UPDATE.md) — Update tanpa kehilangan data host: backup otomatis, validasi, dan rollback (`scripts/safe-update.sh`).
4. [**Task Tracker & Arsitektur**](TASK_TRACKER.md) — Catatan implementasi teknis.

---

## ⚡ Quick Start di VPS Ubuntu

```bash
# 1. Berikan izin eksekusi script deploy
chmod +x deploy.sh

# 2. Jalankan instalasi otomatis
./deploy.sh
```

Akses web panel di:
`http://<IP_VPS_ANDA>:3000`

Default kredensial login (**wajib diganti saat login pertama**):
- **Username:** `admin`
- **Password:** `admin123`

## 🔄 Update di Server yang Sudah Berjalan

```bash
sudo bash scripts/safe-update.sh --dry-run
sudo bash scripts/safe-update.sh
```

Lihat [DEPLOY_UPDATE.md](DEPLOY_UPDATE.md). **Jangan `git pull` manual** saat update dari versi lama.

## 🧪 Test

```bash
cd backend && npm test          # unit + integrasi API
bash tests/test-setup-modsec.sh # script ModSecurity
```

