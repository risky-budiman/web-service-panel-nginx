#!/bin/bash
# ==============================================================================
# Script Deployment Nginx Proxy Control Panel untuk Ubuntu / Debian VPS
# ==============================================================================

set -e

echo "🚀 Memulai Deployment Nginx Proxy Control Panel..."

# 1. Update package dan install dependensi sistem
echo "📦 Menginstall Node.js, Nginx, dan Certbot..."
sudo apt-get update
sudo apt-get install -y curl nginx certbot python3-certbot-nginx

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
npm install --production

# Buat file environment jika belum ada
if [ ! -f .env ]; then
    echo "PORT=3000" > .env
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
    echo "NGINX_CONF_DIR=/etc/nginx/panel-conf.d" >> .env
fi

# 5. Jalankan aplikasi menggunakan PM2
echo "⚡ Menjalankan backend dengan PM2..."
pm2 delete nginx-panel || true
pm2 start server.js --name "nginx-panel"
pm2 save
pm2 startup || true

echo "=============================================================================="
echo "✅ DEPLOYMENT BERHASIL!"
echo "🌐 Buka panel di browser: http://<IP_VPS_ANDA>:3000"
echo "👤 Akun Default: admin / admin123"
echo "⚠️  PENTING: Segera ubah password default di menu Settings!"
echo "=============================================================================="
