#!/bin/bash
# ==============================================================================
# Setup / perbaikan ModSecurity + OWASP CRS untuk Nginx Proxy Panel
#
# Aman dijalankan berulang kali (idempotent). Bisa dipanggil dari deploy.sh
# atau dijalankan sendiri di server yang sudah ter-deploy:
#
#     sudo bash scripts/setup-modsec.sh
#
# Yang dilakukan:
#   1. Pasang modsecurity.conf + OWASP CRS v3.3.5 (jika belum ada)
#   2. SecRuleEngine On, SecAuditEngine RelevantOnly, body limit non-file 10MB
#   3. Izinkan method PUT/PATCH/DELETE (fix rule 911100)
#   4. Pasang pengecualian false positive (modsec/panel-exclusions.conf)
#   5. Susun ulang main.conf dengan urutan include yang benar
#   6. Izin audit log yang aman + logrotate
#   7. Validasi `nginx -t`; jika gagal, semua file dikembalikan (rollback)
# ==============================================================================

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Jalankan dengan sudo: sudo bash $0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
# Path dapat di-override via environment (dipakai oleh tests/test-setup-modsec.sh)
MODSEC_DIR="${MODSEC_DIR:-/etc/nginx/modsec}"
CRS_DIR="$MODSEC_DIR/owasp-crs"
AUDIT_LOG="${AUDIT_LOG:-/var/log/modsec_audit.log}"
LOGROTATE_FILE="${LOGROTATE_FILE:-/etc/logrotate.d/modsec-audit}"
BACKUP_DIR="$MODSEC_DIR/.backup-$(date +%Y%m%d-%H%M%S)"

echo "🛡️  Menyiapkan ModSecurity & OWASP CRS di $MODSEC_DIR..."
mkdir -p "$MODSEC_DIR" "$BACKUP_DIR"

# Backup file yang akan diubah agar bisa rollback
for f in modsecurity.conf main.conf panel-overrides.conf panel-exclusions.conf owasp-crs/crs-setup.conf; do
    if [ -f "$MODSEC_DIR/$f" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$f")"
        cp -a "$MODSEC_DIR/$f" "$BACKUP_DIR/$f"
    fi
done

rollback() {
    echo "↩️  Mengembalikan konfigurasi dari $BACKUP_DIR..."
    for f in modsecurity.conf main.conf panel-overrides.conf panel-exclusions.conf owasp-crs/crs-setup.conf; do
        if [ -f "$BACKUP_DIR/$f" ]; then
            cp -a "$BACKUP_DIR/$f" "$MODSEC_DIR/$f"
        else
            rm -f "$MODSEC_DIR/$f"
        fi
    done
}

# ── 1. modsecurity.conf ───────────────────────────────────────────────────────
if [ ! -f "$MODSEC_DIR/modsecurity.conf" ]; then
    echo "📥 Mengunduh konfigurasi dasar ModSecurity v3.0.4..."
    curl -fsSL -o "$MODSEC_DIR/modsecurity.conf" https://raw.githubusercontent.com/owasp-modsecurity/ModSecurity/v3.0.4/modsecurity.conf-recommended
    curl -fsSL -o "$MODSEC_DIR/unicode.mapping" https://raw.githubusercontent.com/owasp-modsecurity/ModSecurity/v3.0.4/unicode.mapping
fi

# ── 2. Tuning modsecurity.conf ────────────────────────────────────────────────
echo "⚙️  Menyesuaikan modsecurity.conf..."
CONF="$MODSEC_DIR/modsecurity.conf"
sed -i -E 's/^\s*SecRuleEngine\s+\S+/SecRuleEngine On/' "$CONF"
# RelevantOnly: hanya catat request yang memicu rule / status 4xx-5xx.
# "On" mencatat SEMUA request sehingga log membengkak & parser WAF lambat.
sed -i -E 's/^\s*SecAuditEngine\s+\S+/SecAuditEngine RelevantOnly/' "$CONF"
sed -i -E "s|^\s*SecAuditLog\s+.*|SecAuditLog $AUDIT_LOG|" "$CONF"
# Body JSON (tanpa file) dinaikkan dari 128KB -> 10MB (workflow n8n besar, dll)
sed -i -E 's/^\s*SecRequestBodyNoFilesLimit\s+[0-9]+/SecRequestBodyNoFilesLimit 10485760/' "$CONF"

# ── 3. OWASP CRS ──────────────────────────────────────────────────────────────
if [ ! -d "$CRS_DIR" ]; then
    echo "📥 Mengkloning OWASP Core Rule Set (CRS v3.3.5 LTS)..."
    git clone --depth 1 -b v3.3.5 https://github.com/coreruleset/coreruleset.git "$CRS_DIR"
fi
if [ ! -f "$CRS_DIR/crs-setup.conf" ] && [ -f "$CRS_DIR/crs-setup.conf.example" ]; then
    cp "$CRS_DIR/crs-setup.conf.example" "$CRS_DIR/crs-setup.conf"
fi
# Rule 922 membutuhkan libmodsecurity v3.0.8+
if [ -f "$CRS_DIR/rules/REQUEST-922-MULTIPART-ATTACK.conf" ]; then
    mv "$CRS_DIR/rules/REQUEST-922-MULTIPART-ATTACK.conf" "$CRS_DIR/rules/REQUEST-922-MULTIPART-ATTACK.conf.bak"
fi

# ── 4. Override & pengecualian dari repo ──────────────────────────────────────
echo "📋 Memasang panel-overrides.conf & panel-exclusions.conf..."
install -m 644 "$REPO_DIR/modsec/panel-overrides.conf"  "$MODSEC_DIR/panel-overrides.conf"
install -m 644 "$REPO_DIR/modsec/panel-exclusions.conf" "$MODSEC_DIR/panel-exclusions.conf"

# ── 5. main.conf (urutan include penting) ─────────────────────────────────────
echo "🔗 Menyusun ulang $MODSEC_DIR/main.conf..."
cat > "$MODSEC_DIR/main.conf" << EOF
# Dikelola oleh scripts/setup-modsec.sh — jangan diedit manual.
Include $MODSEC_DIR/modsecurity.conf
Include $CRS_DIR/crs-setup.conf
Include $MODSEC_DIR/panel-overrides.conf
Include $MODSEC_DIR/panel-exclusions.conf
Include $CRS_DIR/rules/*.conf
EOF

# ── 6. Audit log: izin aman + logrotate ───────────────────────────────────────
touch "$AUDIT_LOG"
chown www-data:adm "$AUDIT_LOG" 2>/dev/null || true
chmod 640 "$AUDIT_LOG"

cat > "$LOGROTATE_FILE" << EOF
$AUDIT_LOG {
    daily
    rotate 7
    maxsize 200M
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
EOF

# ── 7. Validasi ───────────────────────────────────────────────────────────────
echo "🧪 Menguji konfigurasi Nginx..."
if nginx -t; then
    systemctl reload nginx
    echo "✅ ModSecurity berhasil dikonfigurasi & Nginx di-reload."
    echo "   Backup konfigurasi lama: $BACKUP_DIR"
else
    echo "❌ nginx -t gagal. Konfigurasi tidak diterapkan."
    rollback
    nginx -t && systemctl reload nginx || true
    exit 1
fi
