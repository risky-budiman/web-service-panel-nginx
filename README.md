# 🖥️ Nginx Reverse Proxy Control Panel

Web control panel modern dan ringan berbasis **Node.js (Express 5)**, **Vue.js 3 SPA**, dan **SQLite (sql.js)** untuk mengelola proxy host Nginx, domain routing, SSL certificates, dan access logs secara visual dan mudah.

---

## 🚀 Fitur Utama
- **Dashboard Proxy:** Kelola proxy host (CRUD: Create, Read, Update, Delete) dan toggle aktif/nonaktif dalam 1 klik.
- **Generator Nginx Otomatis:** Menulis dan menghapus file `.conf` Nginx secara terisolasi tanpa merusak konfigurasi sistem utama.
- **SSL / TLS Manager:** Monitoring masa aktif sertifikat HTTPS dan aktivasi SSL Let's Encrypt / Certbot.
- **Real-time Access Logs:** Log viewer interaktif dengan pencarian cepat dan pemfilteran kode status HTTP (2xx, 4xx, 5xx).
- **Keamanan:** Autentikasi JWT terproteksi, password hashing dengan bcrypt, ganti password admin, dan tombol download backup basis data `panel.db`.
- **Dukungan Domain Sendiri:** Web panel ini dapat diakses langsung menggunakan domain/subdomain pribadi (contoh: `https://panel.domainanda.com`).

---

## 📚 Dokumentasi Panduan
1. [**Panduan Lengkap Ubuntu & Domain Setup**](file:///d:/AI%20Code/web%20service/PANDUAN_UBUNTU_DAN_DOMAIN.md) — Langkah instalasi library lengkap pada Ubuntu dari nol hingga memasang domain & HTTPS.
2. [**Panduan Deployment VPS (PM2 & Script Otomatis)**](file:///d:/AI%20Code/web%20service/DEPLOY_GUIDE.md) — Panduan cepat deployment menggunakan `deploy.sh` atau manual.
3. [**Task Tracker & Arsitektur**](file:///d:/AI%20Code/web%20service/TASK_TRACKER.md) — Catatan implementasi teknis dan status penyelesaian tugas (100% selesai).

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

Default kredensial login:
- **Username:** `admin`
- **Password:** `admin123`
# web-service-panel-nginx
