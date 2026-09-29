# 📖 Panduan Lengkap Instalasi & Deployment Nginx Proxy Control Panel di Ubuntu

Dokumentasi ini menjelaskan langkah demi langkah mulai dari persiapan server Ubuntu baru, instalasi semua library dan dependensi yang dibutuhkan, pengaturan reverse proxy Nginx, hingga cara menghubungkan **Domain Sendiri** dan mengaktifkan **SSL Gratis (Let's Encrypt)** untuk web panel ini.

---

## 📑 Daftar Isi
1. [Spesifikasi Server & Port yang Dibutuhkan](#1-spesifikasi-server--port-yang-dibutuhkan)
2. [Instalasi Library & Dependensi pada Ubuntu](#2-instalasi-library--dependensi-pada-ubuntu)
3. [Menyiapkan Berkas Aplikasi di VPS](#3-menyiapkan-berkas-aplikasi-di-vps)
4. [Mengonfigurasi Nginx untuk Web Panel](#4-mengonfigurasi-nginx-untuk-web-panel)
5. [Menjalankan Aplikasi dengan PM2 (Auto-Restart)](#5-menjalankan-aplikasi-dengan-pm2-auto-restart)
6. [Menggunakan Domain Sendiri untuk Web Panel](#6-menggunakan-domain-sendiri-untuk-web-panel)
7. [Memasang SSL Gratis (HTTPS) Menggunakan Certbot](#7-memasang-ssl-gratis-https-menggunakan-certbot)
8. [Perintah Maintenance & Troubleshooting](#8-perintah-maintenance--troubleshooting)

---

## 1. Spesifikasi Server & Port yang Dibutuhkan

- **Sistem Operasi yang Didukung:** Ubuntu 20.04 LTS, Ubuntu 22.04 LTS, Ubuntu 24.04 LTS (atau Debian 11/12)
- **RAM Minimal:** 512 MB (Direkomendasikan 1 GB ke atas)
- **Port yang Wajib Dibuka di Firewall / Security Group Provider:**
  - `Port 22` — Akses SSH server
  - `Port 80` — Lalu lintas HTTP standar & verifikasi SSL Certbot
  - `Port 443` — Lalu lintas aman HTTPS
  - `Port 3000` *(Opsional/Internal)* — Port backend aplikasi (hanya diakses lokal oleh Nginx)

---

## 2. Instalasi Library & Dependensi pada Ubuntu

Jalankan perintah berikut pada terminal server Ubuntu Anda secara berurutan:

### Langkah 2.1: Update Repository & Sistem
```bash
sudo apt update && sudo apt upgrade -y
```

### Langkah 2.2: Instal Alat Dasar (Tools)
```bash
sudo apt install -y curl wget git unzip software-properties-common
```

### Langkah 2.3: Instal Nginx & Certbot (Let's Encrypt)
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Pastikan Nginx berjalan dan aktif saat server booting:
```bash
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Langkah 2.4: Instal Node.js (Versi 20 LTS) & NPM
Gunakan NodeSource repository resmi:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verifikasi versi terinstal:
```bash
node -v   # Harusnya v20.x.x
npm -v    # Harusnya v10.x.x
```

### Langkah 2.5: Instal PM2 (Process Manager)
PM2 berfungsi agar aplikasi Node.js tetap hidup di latar belakang dan otomatis hidup kembali jika VPS restart/reboot.
```bash
sudo npm install -g pm2
```

---

## 3. Menyiapkan Berkas Aplikasi di VPS

### Langkah 3.1: Buat Folder Proyek
```bash
sudo mkdir -p /var/www/nginx-panel
sudo chown -R $USER:$USER /var/www/nginx-panel
cd /var/www/nginx-panel
```

### Langkah 3.2: Upload / Salin Berkas Proyek
Salin seluruh file proyek (folder `backend/`, `frontend/`, `deploy.sh`, dll.) ke folder `/var/www/nginx-panel`.

### Langkah 3.3: Kompilasi Frontend
```bash
cd /var/www/nginx-panel/frontend
npm install
npm run build
```
*Hasil kompilasi akan otomatis berada di `/var/www/nginx-panel/frontend/dist`.*

### Langkah 3.4: Siapkan Backend & Environment
```bash
cd /var/www/nginx-panel/backend
npm install --production
```

Buat file environment `.env`:
```bash
nano .env
```
Isi dengan konfigurasi berikut:
```env
PORT=3000
JWT_SECRET=buat_kunci_rahasia_acak_yang_panjang_dan_aman_disini
NGINX_CONF_DIR=/etc/nginx/panel-conf.d
```
*Simpan dengan menekan `Ctrl + O`, lalu `Enter`, dan keluar dengan `Ctrl + X`.*

---

## 4. Mengonfigurasi Nginx untuk Web Panel

Panel membutuhkan folder terpisah agar dapat menulis konfigurasi proxy domain secara otomatis tanpa mengganggu konfigurasi utama Nginx server Anda.

### Langkah 4.1: Siapkan Folder Konfigurasi Panel
```bash
sudo mkdir -p /etc/nginx/panel-conf.d
```

### Langkah 4.2: Hubungkan ke `nginx.conf`
Buka konfigurasi utama Nginx:
```bash
sudo nano /etc/nginx/nginx.conf
```
Cari blok `http { ... }`, lalu pastikan ada baris berikut di dalamnya:
```nginx
http {
    ...
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/panel-conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
    ...
}
```
*Simpan dan keluar (`Ctrl + O`, `Enter`, `Ctrl + X`).*

Tes konfigurasi:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Menjalankan Aplikasi dengan PM2 (Auto-Restart)

Jalankan backend server menggunakan PM2:
```bash
cd /var/www/nginx-panel/backend
pm2 start server.js --name "nginx-panel"
```

Simpan daftar proses PM2 agar otomatis hidup saat server reboot:
```bash
pm2 save
pm2 startup
```
*(Jika muncul perintah sudo yang disarankan oleh terminal setelah menjalankan `pm2 startup`, salin dan jalankan perintah tersebut).*

Cek status aplikasi:
```bash
pm2 status
```

---

## 6. Menggunakan Domain Sendiri untuk Web Panel

**Apakah web panel ini bisa menggunakan domain sendiri?**
> **YA, SANGAT BISA!** Anda dapat mengakses panel ini melalui domain/subdomain seperti: `panel.domainanda.com` tanpa perlu mengetikkan port `:3000`.

### Langkah 6.1: Arahkan DNS Domain ke IP VPS
1. Buka DNS Management domain Anda (misal di Cloudflare, Niagahoster, Rumahweb, Namecheap, dll.).
2. Tambahkan **A Record**:
   - **Type:** `A`
   - **Name:** `panel` *(atau `@` jika ingin domain utama)*
   - **IPv4 Address:** Masukkan IP Publik VPS Anda
   - **TTL:** Auto atau 14400
   - **Proxy status:** DNS Only (Jika memakai Cloudflare, matikan proxy cloud oranye sementara agar sertifikat SSL Let's Encrypt dapat divalidasi).

### Langkah 6.2: Buat Konfigurasi Nginx untuk Web Panel
Buat file konfigurasi vhost Nginx baru di VPS:
```bash
sudo nano /etc/nginx/sites-available/nginx-panel.conf
```

Tempelkan konfigurasi berikut (ganti `panel.domainanda.com` dengan domain Anda):
```nginx
server {
    listen 80;
    server_name panel.domainanda.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forwarded Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Aktifkan konfigurasi tersebut:
```bash
sudo ln -s /etc/nginx/sites-available/nginx-panel.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Sekarang web panel Anda sudah bisa diakses melalui browser:
`http://panel.domainanda.com`

---

## 7. Memasang SSL Gratis (HTTPS) Menggunakan Certbot

Agar koneksi web panel terenkripsi dengan aman (gembok hijau), pasang SSL gratis dari Let's Encrypt menggunakan Certbot:

Jalankan perintah ini:
```bash
sudo certbot --nginx -d panel.domainanda.com
```

- Masukkan email Anda saat diminta.
- Ketik `Y` untuk menyetujui Terms of Service.
- Certbot akan otomatis mengonfigurasi sertifikat SSL pada file Nginx Anda dan mengaktifkan pengalihan otomatis dari HTTP ke HTTPS!

Sekarang web panel Anda dapat dibuka dengan aman di:
👉 **`https://panel.domainanda.com`**

Certbot juga otomatis memperbarui sertifikat per 90 hari. Anda bisa menguji auto-renew dengan perintah:
```bash
sudo certbot renew --dry-run
```

---

## 8. Perintah Maintenance & Troubleshooting

| Kebutuhan | Perintah |
| :--- | :--- |
| **Cek status panel** | `pm2 status` |
| **Lihat log error panel** | `pm2 logs nginx-panel` |
| **Restart aplikasi panel** | `pm2 restart nginx-panel` |
| **Cek status Nginx** | `sudo systemctl status nginx` |
| **Uji sintaks konfigurasi Nginx** | `sudo nginx -t` |
| **Reload Nginx** | `sudo systemctl reload nginx` |
| **Backup Database Manual** | Download via menu **⚙️ Settings** di Web UI atau copy file `/var/www/nginx-panel/backend/data/panel.db` |

---

### Kredensial Default Login Pertama:
- **Username:** `admin`
- **Password:** `admin123`
*(Sangat disarankan segera mengganti password di menu **⚙️ Settings** setelah berhasil login pertama kali).*
