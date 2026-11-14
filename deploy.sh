#!/bin/bash
# ==============================================================================
# Script Deployment Nginx Proxy Control Panel untuk Ubuntu / Debian VPS
# ==============================================================================

set -e

echo "🚀 Memulai Deployment Nginx Proxy Control Panel..."

# 1. Update package dan install dependensi sistem
echo "📦 Menginstall Node.js, Nginx, ModSecurity, dan Certbot..."
sudo apt-get update
sudo apt-get install -y curl nginx certbot python3-certbot-nginx git software-properties-common

# Pastikan modul konektor Nginx ModSecurity terpasang
if [ ! -f /etc/nginx/modules-enabled/50-mod-http-modsecurity.conf ] && ! nginx -V 2>&1 | grep -q "http_modsecurity"; then
    echo "🛡️ Menyiapkan ModSecurity Connector untuk Nginx..."
    sudo add-apt-repository -y ppa:ondrej/nginx || true
    sudo apt-get update || true
    sudo apt-get install -y libnginx-mod-http-modsecurity || true
fi

# Install Node.js LTS (jika belum ada)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20.x LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 secara global
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 2. Siapkan direktori konfigurasi Nginx panel
NGINX_CONF_DIR="/etc/nginx/panel-conf.d"
echo "📁 Menyiapkan direktori Nginx: $NGINX_CONF_DIR..."
sudo mkdir -p $NGINX_CONF_DIR

# 2.1 Siapkan ModSecurity & OWASP Core Rule Set (CRS)
# Konfigurasi lengkap (method REST, body limit, pengecualian false positive,
# izin audit log, logrotate, validasi + rollback) ada di scripts/setup-modsec.sh
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo bash "$DEPLOY_DIR/scripts/setup-modsec.sh"

# Pastikan /etc/nginx/nginx.conf memuat include /etc/nginx/panel-conf.d/*.conf;
if ! grep -q "panel-conf.d" /etc/nginx/nginx.conf; then
    echo "🔗 Menambahkan include panel-conf.d ke /etc/nginx/nginx.conf..."
    sudo sed -i '/http {/a \    include /etc/nginx/panel-conf.d/*.conf;' /etc/nginx/nginx.conf
    sudo nginx -t
    sudo systemctl reload nginx
fi

# 3. Build Frontend
echo "🔨 Mengompilasi Frontend..."
cd frontend
npm install
npm run build
cd ..

# 4. Install dependensi Backend
echo "📦 Menyiapkan Backend..."
cd backend
npm install --omit=dev

# Buat file environment jika belum ada
if [ ! -f .env ]; then
    echo "PORT=3000" > .env
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
    echo "NGINX_CONF_DIR=/etc/nginx/panel-conf.d" >> .env
    echo "MODSEC_AUDIT_LOG=/var/log/modsec_audit.log" >> .env
    echo "# Setelah panel diakses lewat domain + HTTPS, aktifkan baris berikut:" >> .env
    echo "# HOST=127.0.0.1" >> .env
    echo "# Email notifikasi kedaluwarsa sertifikat Let's Encrypt:" >> .env
    echo "# CERTBOT_EMAIL=admin@domain-anda.com" >> .env
fi
# Pastikan JWT_SECRET selalu ada (instalasi lama)
if ! grep -qE '^JWT_SECRET=.{32,}' .env; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env

# 5. Jalankan aplikasi menggunakan PM2
echo "⚡ Menjalankan backend dengan PM2..."
pm2 delete nginx-panel || true
pm2 start server.js --name "nginx-panel"
pm2 save
pm2 startup || true

echo "=============================================================================="
echo "✅ DEPLOYMENT BERHASIL!"
echo "🌐 Buka panel di browser: http://<IP_VPS_ANDA>:3000"
echo "👤 Akun Default: admin / admin123 (wajib diganti saat login pertama)"
echo "🛡️ ModSecurity & OWASP CRS telah terpasang dan aktif!"
echo "🔒 Disarankan: akses panel via domain + HTTPS lalu set HOST=127.0.0.1 di backend/.env"
echo "=============================================================================="
