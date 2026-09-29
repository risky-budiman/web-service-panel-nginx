# Panduan Deployment Nginx Proxy Control Panel ke VPS

Dokumen ini menjelaskan langkah-langkah mudah untuk mendeploy aplikasi ini ke server VPS (Ubuntu / Debian).

---

## 1. Persyaratan VPS
- **OS:** Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian 11 / 12
- **Port Terbuka:**
  - `80` (HTTP) & `443` (HTTPS) untuk reverse proxy domain
  - `3000` (atau port panel web yang ditentukan)

---

## 2. Cara Cepat (Automated Deploy)
Cukup jalankan satu perintah berikut di root folder proyek pada VPS:

```bash
chmod +x deploy.sh
./deploy.sh
```

Script ini akan otomatis:
1. Menginstal Node.js, Nginx, Certbot, dan PM2.
2. Mengonfigurasi `/etc/nginx/panel-conf.d` di dalam `nginx.conf`.
3. Mengompilasi frontend (`npm run build`).
4. Menginstal dependensi backend dan membuat JWT Secret acak yang aman.
5. Menjalankan panel menggunakan PM2 auto-restart saat VPS reboot.

---

## 3. Cara Manual (Langkah demi Langkah)

### Langkah 1: Build Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```
Hasil build akan tersimpan di `frontend/dist/` dan otomatis disajikan langsung oleh server backend Express.

### Langkah 2: Setup Backend
```bash
cd backend
npm install
```

Buat file `backend/.env`:
```env
PORT=3000
JWT_SECRET=kunci_rahasia_acak_yang_panjang
NGINX_CONF_DIR=/etc/nginx/panel-conf.d
```

### Langkah 3: Setup Konfigurasi Nginx VPS
Buat direktori konfigurasi panel:
```bash
sudo mkdir -p /etc/nginx/panel-conf.d
```

Buka `/etc/nginx/nginx.conf` dan tambahkan baris ini di dalam blok `http { ... }`:
```nginx
include /etc/nginx/panel-conf.d/*.conf;
```

Uji dan reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Langkah 4: Jalankan Service dengan PM2
```bash
cd backend
pm2 start server.js --name "nginx-panel"
pm2 save
pm2 startup
```

Akses panel Anda di:
`http://<IP_VPS_ANDA>:3000`

Default kredensial:
- **Username:** `admin`
- **Password:** `admin123` *(Segera ganti melalui menu **Settings**)*

---

## 4. Keamanan & Backup Data
- Seluruh data tersimpan secara persisten pada file `backend/data/panel.db`.
- Anda dapat mengunduh file cadangan database kapan saja langsung dari tombol **Download Backup (panel.db)** di menu **Settings**.
- Untuk memulihkan (restore) ke server baru, cukup letakkan file `panel.db` tersebut di folder `backend/data/`.
