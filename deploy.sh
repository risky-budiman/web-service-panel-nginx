#!/bin/bash
# ==============================================================================
# Script Deployment Nginx Proxy Control Panel untuk Ubuntu / Debian VPS
# ==============================================================================

set -e

echo "🚀 Memulai Deployment Nginx Proxy Control Panel..."

# 1. Update package dan install dependensi sistem
echo "📦 Menginstall Node.js, Nginx, ModSecurity, dan Certbot..."
sudo apt-get update
sudo apt-get install -y curl nginx certbot python3-certbot-nginx git libnginx-mod-http-modsecurity

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
MODSEC_DIR="/etc/nginx/modsec"
echo "🛡️ Menyiapkan ModSecurity & OWASP CRS di $MODSEC_DIR..."
sudo mkdir -p $MODSEC_DIR

# Download default modsecurity.conf jika belum ada
if [ ! -f "$MODSEC_DIR/modsecurity.conf" ]; then
    echo "📥 Mengunduh konfigurasi dasar ModSecurity..."
    sudo curl -fsSL -o "$MODSEC_DIR/modsecurity.conf" https://raw.githubusercontent.com/owasp-modsecurity/ModSecurity/v3/master/modsecurity.conf-recommended || true
    if [ -f "$MODSEC_DIR/modsecurity.conf" ]; then
        sudo sed -i 's/SecRuleEngine DetectionOnly/SecRuleEngine On/g' "$MODSEC_DIR/modsecurity.conf"
    fi
fi

# Setup OWASP CRS jika belum ada
if [ ! -d "$MODSEC_DIR/owasp-crs" ]; then
    echo "📥 Mengkloning OWASP Core Rule Set (CRS)..."
    sudo git clone --depth 1 https://github.com/coreruleset/coreruleset.git "$MODSEC_DIR/owasp-crs" || true
    if [ -f "$MODSEC_DIR/owasp-crs/crs-setup.conf.example" ]; then
        sudo cp "$MODSEC_DIR/owasp-crs/crs-setup.conf.example" "$MODSEC_DIR/owasp-crs/crs-setup.conf"
    fi
fi

# Buat /etc/nginx/modsec/main.conf
if [ ! -f "$MODSEC_DIR/main.conf" ]; then
    echo "⚙️ Membuat $MODSEC_DIR/main.conf..."
    sudo tee "$MODSEC_DIR/main.conf" > /dev/null << 'EOF'
Include /etc/nginx/modsec/modsecurity.conf
Include /etc/nginx/modsec/owasp-crs/crs-setup.conf
Include /etc/nginx/modsec/owasp-crs/rules/*.conf
EOF
fi

# Siapkan file audit log ModSecurity dengan izin akses yang tepat
sudo touch /var/log/modsec_audit.log
sudo chmod 666 /var/log/modsec_audit.log || true

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
    echo "MODSEC_AUDIT_LOG=/var/log/modsec_audit.log" >> .env
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
echo "🛡️ ModSecurity & OWASP CRS telah terpasang dan aktif!"
echo "⚠️  PENTING: Segera ubah password default di menu Settings!"
echo "=============================================================================="
