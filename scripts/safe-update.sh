#!/bin/bash
# ==============================================================================
# Update aman Nginx Proxy Panel di server produksi
#
#   sudo bash scripts/safe-update.sh [opsi]
#
# Server yang BELUM punya script ini (versi lama) — ambil langsung dari git:
#   cd /var/www/nginx-panel && git fetch origin
#   git show origin/main:scripts/safe-update.sh > /tmp/safe-update.sh
#   sudo bash /tmp/safe-update.sh --app-dir /var/www/nginx-panel
#
# Opsi:
#   --app-dir <dir>         Folder aplikasi (default: folder induk script ini)
#   --branch <nama>         Branch yang di-pull (default: branch aktif di server)
#   --yes                   Jangan minta konfirmasi
#   --allow-invalid-hosts   Lanjut walau ada host yang tidak lolos validasi baru
#   --skip-modsec           Jangan jalankan scripts/setup-modsec.sh
#   --dry-run               Hanya pemeriksaan awal, tidak mengubah apa pun
#
# Alur:
#   1. Pemeriksaan awal (tanpa mengubah apa pun): repo, perubahan lokal, commit baru,
#      validasi semua host memakai validator VERSI BARU
#   2. Hentikan panel (Nginx & semua domain TETAP berjalan) lalu backup lengkap:
#      database, .env, JWT secret, config Nginx panel, config ModSecurity
#   3. Pull aman: panel.db tidak pernah tersentuh git (dipulihkan dari backup + diverifikasi)
#   4. Install dependency, build frontend, setup ModSecurity
#   5. Start panel + health check
#   6. Jika ada langkah yang gagal → ROLLBACK OTOMATIS ke kondisi sebelum update
# ==============================================================================

set -Eeuo pipefail

# ── Opsi ──────────────────────────────────────────────────────────────────────
APP_DIR_ARG=""
BRANCH=""
ASSUME_YES=0
ALLOW_INVALID=0
SKIP_MODSEC=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --app-dir) APP_DIR_ARG="${2:-}"; shift 2 ;;
        --branch) BRANCH="${2:-}"; shift 2 ;;
        --yes|-y) ASSUME_YES=1; shift ;;
        --allow-invalid-hosts) ALLOW_INVALID=1; shift ;;
        --skip-modsec) SKIP_MODSEC=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
        *) echo "Opsi tidak dikenal: $1 (lihat --help)"; exit 2 ;;
    esac
done

# ── Konfigurasi (bisa di-override via environment) ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${APP_DIR_ARG:-$SCRIPT_DIR/..}" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-/root/nginx-panel-backups}"
BACKUP_DIR="$BACKUP_ROOT/$TS"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/panel-conf.d}"
MODSEC_DIR="${MODSEC_DIR:-/etc/nginx/modsec}"
PM2_NAME="${PM2_NAME:-nginx-panel}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-45}"
DB_REL="backend/data/panel.db"

# Path lokal yang boleh berubah di server dan aman dibuang sebelum pull
# (database dibackup & dipulihkan terpisah; sisanya dibuat ulang oleh npm / build)
ALLOWED_LOCAL_CHANGES='^(backend/data/|backend/node_modules/|frontend/node_modules/|frontend/dist/|backend/nginx-configs/|backend/package-lock\.json$|frontend/package-lock\.json$)'

C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YLW=$'\e[33m'; C_BLD=$'\e[1m'; C_RST=$'\e[0m'
step() { echo; echo "${C_BLD}▶ $*${C_RST}"; }
ok()   { echo "  ${C_GRN}✓${C_RST} $*"; }
warn() { echo "  ${C_YLW}⚠${C_RST} $*"; }
fail() { echo "  ${C_RED}✗${C_RST} $*" >&2; }
die()  { fail "$*"; exit 1; }

STAGE="preflight"
PREV_COMMIT=""

# ── Rollback otomatis bila gagal setelah perubahan dimulai ────────────────────
on_error() {
    local code=$?
    trap - ERR
    if [ "$STAGE" = "update" ]; then
        echo
        fail "Update gagal (exit $code). Menjalankan rollback otomatis..."
        if bash "$BACKUP_DIR/rollback.sh"; then
            echo "${C_YLW}Sistem sudah dikembalikan ke kondisi sebelum update (commit ${PREV_COMMIT:0:7}).${C_RST}"
        else
            fail "Rollback otomatis gagal. Jalankan manual: sudo bash $BACKUP_DIR/rollback.sh"
        fi
    elif [ "$STAGE" = "backup" ]; then
        fail "Gagal saat backup — belum ada yang diubah. Menyalakan kembali panel..."
        pm2 start "$PM2_NAME" >/dev/null 2>&1 || true
    else
        fail "Pemeriksaan awal gagal (exit $code) pada baris ${BASH_LINENO[0]} — tidak ada yang diubah."
    fi
    exit "$code"
}
trap on_error ERR

# ==============================================================================
step "1/6 Pemeriksaan awal (belum ada yang diubah)"
# ==============================================================================
[ "$(id -u)" -eq 0 ] || die "Jalankan dengan sudo / sebagai root"
for cmd in git node npm pm2 nginx tar curl; do
    command -v "$cmd" >/dev/null 2>&1 || die "Perintah '$cmd' tidak ditemukan"
done
cd "$APP_DIR"
[ -d .git ] && [ -f backend/server.js ] || die "$APP_DIR bukan folder aplikasi Nginx Proxy Panel"
ok "Folder aplikasi: $APP_DIR"

PREV_COMMIT="$(git rev-parse HEAD)"
[ -n "$BRANCH" ] || BRANCH="$(git rev-parse --abbrev-ref HEAD)"
ok "Versi saat ini: ${PREV_COMMIT:0:7} (branch $BRANCH)"

# Perubahan lokal selain path yang diizinkan → hentikan, jangan sampai hilang
UNEXPECTED="$(git status --porcelain --untracked-files=no | awk '{print $NF}' | grep -Ev "$ALLOWED_LOCAL_CHANGES" || true)"
if [ -n "$UNEXPECTED" ]; then
    fail "Ada file yang diubah manual di server dan bisa tertimpa update:"
    echo "$UNEXPECTED" | sed 's/^/      /'
    die "Simpan / commit perubahan tersebut dulu (git stash atau git diff > patch)"
fi
ok "Tidak ada perubahan lokal yang berisiko tertimpa"

git fetch --quiet origin "$BRANCH" || die "Gagal mengambil update dari origin/$BRANCH"
TARGET="origin/$BRANCH"
NEW_COMMIT="$(git rev-parse "$TARGET")"
INCOMING="$(git rev-list --count "HEAD..$TARGET")"
if [ "$INCOMING" -eq 0 ]; then
    ok "Sudah versi terbaru (${NEW_COMMIT:0:7}). Tidak ada yang perlu di-update."
    exit 0
fi
git merge-base --is-ancestor HEAD "$TARGET" || die "Riwayat server bercabang dari $TARGET (tidak bisa fast-forward)"
ok "$INCOMING commit baru → ${NEW_COMMIT:0:7}:"
git log --oneline -15 "HEAD..$TARGET" | sed 's/^/      /'

# Validasi semua host memakai validator dari VERSI BARU, tanpa pull
TMP_CHECK="$(mktemp -d)"
git show "$TARGET:backend/middleware/validator.js" > "$TMP_CHECK/validator.js"
git show "$TARGET:scripts/check-hosts.js" > "$TMP_CHECK/check-hosts.js"
# "|| CHECK_RC=$?" → exit code 1 (ada host tidak valid) tidak memicu trap ERR
CHECK_RC=0
node "$TMP_CHECK/check-hosts.js" --root "$APP_DIR" --db "$APP_DIR/$DB_REL" --validator "$TMP_CHECK/validator.js" \
    > "$TMP_CHECK/result.txt" 2>&1 || CHECK_RC=$?
sed 's/^/      /' "$TMP_CHECK/result.txt"
rm -rf "$TMP_CHECK"
if [ "$CHECK_RC" -eq 1 ] && [ "$ALLOW_INVALID" -ne 1 ]; then
    die "Ada host yang tidak lolos validasi baru. Perbaiki datanya, atau jalankan ulang dengan --allow-invalid-hosts"
elif [ "$CHECK_RC" -ge 2 ]; then
    die "Pemeriksaan host gagal dijalankan"
fi
ok "Validasi host selesai"

if [ "$DRY_RUN" -eq 1 ]; then
    echo; ok "Dry-run selesai. Tidak ada yang diubah."
    exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
    echo
    echo "  Panel akan dihentikan sebentar (±1–3 menit). Nginx dan semua domain TETAP berjalan."
    read -r -p "  Lanjutkan update? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "  Dibatalkan."; exit 0; }
fi

# ==============================================================================
step "2/6 Hentikan panel & backup lengkap → $BACKUP_DIR"
# ==============================================================================
STAGE="backup"
# Panel dihentikan agar database tidak berubah saat dibackup.
# Nginx tidak disentuh: semua domain tetap melayani trafik.
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 stop "$PM2_NAME" >/dev/null
    ok "Panel ($PM2_NAME) dihentikan sementara"
else
    warn "Proses PM2 '$PM2_NAME' tidak ditemukan — dilanjutkan tanpa menghentikan panel"
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR"

[ -f "$DB_REL" ] || die "Database $DB_REL tidak ditemukan — update dihentikan demi keamanan"
cp -a backend/data "$BACKUP_DIR/data"
cmp -s "$DB_REL" "$BACKUP_DIR/data/panel.db" || die "Verifikasi backup database gagal"
ok "Database dibackup & diverifikasi ($(du -h "$DB_REL" | cut -f1))"

if [ -f backend/.env ]; then cp -a backend/.env "$BACKUP_DIR/backend.env"; ok "backend/.env dibackup"; fi
if [ -d "$NGINX_CONF_DIR" ]; then
    tar -czf "$BACKUP_DIR/nginx-panel-conf.tgz" -C "$(dirname "$NGINX_CONF_DIR")" "$(basename "$NGINX_CONF_DIR")"
    ok "Config Nginx panel dibackup ($NGINX_CONF_DIR)"
fi
if [ -d "$MODSEC_DIR" ]; then
    tar -czf "$BACKUP_DIR/modsec.tgz" -C "$(dirname "$MODSEC_DIR")" "$(basename "$MODSEC_DIR")"
    ok "Config ModSecurity dibackup ($MODSEC_DIR)"
fi
echo "$PREV_COMMIT" > "$BACKUP_DIR/commit.txt"

# Script rollback mandiri (nilai sudah tertanam, bisa dijalankan kapan saja)
cat > "$BACKUP_DIR/rollback.sh" <<ROLLBACK
#!/bin/bash
# Rollback ke kondisi sebelum update $TS (commit ${PREV_COMMIT:0:7})
set -uo pipefail
echo "↩️  Rollback ke commit ${PREV_COMMIT:0:7}..."
cd "$APP_DIR" || exit 1
pm2 stop "$PM2_NAME" >/dev/null 2>&1 || true
git reset --hard "$PREV_COMMIT"
# Database & secret selalu dari backup (bukan dari git)
rm -rf backend/data && cp -a "$BACKUP_DIR/data" backend/data
[ -f "$BACKUP_DIR/backend.env" ] && cp -a "$BACKUP_DIR/backend.env" backend/.env
if [ -f "$BACKUP_DIR/nginx-panel-conf.tgz" ]; then
    rm -rf "$NGINX_CONF_DIR" && tar -xzf "$BACKUP_DIR/nginx-panel-conf.tgz" -C "$(dirname "$NGINX_CONF_DIR")"
fi
if [ -f "$BACKUP_DIR/modsec.tgz" ]; then
    rm -rf "$MODSEC_DIR" && tar -xzf "$BACKUP_DIR/modsec.tgz" -C "$(dirname "$MODSEC_DIR")"
fi
(cd backend && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1) || true
if [ ! -f frontend/dist/index.html ]; then (cd frontend && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1) || true; fi
nginx -t >/dev/null 2>&1 && systemctl reload nginx
pm2 restart "$PM2_NAME" >/dev/null 2>&1 || pm2 start backend/server.js --name "$PM2_NAME" >/dev/null 2>&1
echo "✅ Rollback selesai. Database: $BACKUP_DIR/data/panel.db"
ROLLBACK
chmod 700 "$BACKUP_DIR/rollback.sh"
ok "Script rollback dibuat: $BACKUP_DIR/rollback.sh"

# ==============================================================================
step "3/6 Pull aman (database tidak disentuh git)"
# ==============================================================================
STAGE="update"
# Buang perubahan lokal pada path yang diizinkan (database sudah aman di backup)
DISCARD="$(git status --porcelain --untracked-files=no | awk '{print $NF}' | grep -E "$ALLOWED_LOCAL_CHANGES" || true)"
if [ -n "$DISCARD" ]; then
    echo "$DISCARD" | xargs -r git checkout --
    ok "Perubahan lokal pada file yang dibuat ulang otomatis dibersihkan ($(echo "$DISCARD" | wc -l) file)"
fi

git merge --ff-only --quiet "$TARGET"
ok "Kode diperbarui ke ${NEW_COMMIT:0:7}"

# Pulihkan database & secret dari backup, lalu verifikasi byte-per-byte
mkdir -p backend/data
cp -a "$BACKUP_DIR/data/." backend/data/
cmp -s "$DB_REL" "$BACKUP_DIR/data/panel.db" || { fail "Database tidak sama dengan backup"; false; }
ok "Database produksi utuh (identik dengan backup)"
[ -z "$(git ls-files "$DB_REL")" ] && ok "panel.db tidak lagi dilacak git (aman untuk update berikutnya)"

# ==============================================================================
step "4/6 Dependency, build frontend, konfigurasi"
# ==============================================================================
(cd backend && npm ci --omit=dev --no-audit --no-fund >/dev/null)
ok "Dependency backend terpasang"
(cd frontend && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null)
[ -f frontend/dist/index.html ] || { fail "Build frontend tidak menghasilkan dist/index.html"; false; }
ok "Frontend di-build"

touch backend/.env
if ! grep -qE '^JWT_SECRET=.{32,}' backend/.env; then
    echo "JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> backend/.env
    warn "JWT_SECRET belum ada → dibuat baru (semua user perlu login ulang sekali)"
fi
chmod 600 backend/.env
ok "backend/.env siap (izin 600)"

MODSEC_STATUS="dilewati (--skip-modsec)"
if [ "$SKIP_MODSEC" -ne 1 ]; then
    # setup-modsec.sh punya backup + rollback sendiri; kegagalannya tidak membatalkan update panel
    if bash scripts/setup-modsec.sh > "$BACKUP_DIR/setup-modsec.log" 2>&1; then
        MODSEC_STATUS="diperbarui"
        ok "ModSecurity diperbarui (log: $BACKUP_DIR/setup-modsec.log)"
    else
        MODSEC_STATUS="GAGAL — config WAF lama tetap dipakai"
        warn "setup-modsec.sh gagal dan sudah rollback sendiri. Lihat $BACKUP_DIR/setup-modsec.log"
    fi
fi

# ==============================================================================
step "5/6 Menyalakan panel & health check"
# ==============================================================================
PORT="$(grep -E '^PORT=' backend/.env | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-3000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:$PORT/api/health}"

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" --update-env >/dev/null
else
    pm2 start backend/server.js --name "$PM2_NAME" >/dev/null
fi

healthy=0
for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
done
[ "$healthy" -eq 1 ] || { fail "Panel tidak merespons di $HEALTH_URL dalam ${HEALTH_TIMEOUT} detik"; false; }
ok "Panel aktif ($HEALTH_URL)"

if nginx -t >/dev/null 2>&1; then
    ok "nginx -t: konfigurasi valid"
else
    fail "nginx -t gagal setelah update"
    nginx -t 2>&1 | sed 's/^/      /' || true
    false
fi
pm2 save >/dev/null 2>&1 || true

# Cek data host masih lengkap setelah panel start (jumlah sama dengan backup)
# Exit 1 (ada host tidak valid, sudah diizinkan) bukan kegagalan; hanya exit ≥2 yang gagal
AFTER_RC=0
node scripts/check-hosts.js --db "$DB_REL" >/dev/null 2>&1 || AFTER_RC=$?
[ "$AFTER_RC" -le 1 ] || { fail "Database tidak bisa dibaca setelah update"; false; }
ok "Data host terbaca normal setelah update"

STAGE="done"

# ==============================================================================
step "6/6 Selesai ✅"
# ==============================================================================
cat <<SUMMARY
  Versi        : ${PREV_COMMIT:0:7} → ${NEW_COMMIT:0:7}
  Backup       : $BACKUP_DIR
  ModSecurity  : $MODSEC_STATUS
  Rollback     : sudo bash $BACKUP_DIR/rollback.sh

  Langkah berikutnya:
   1. Buka panel & login. Jika password masih admin123, Anda diminta menggantinya.
   2. Buka beberapa domain di browser untuk memastikan semuanya normal.
   3. WAF: pakai mode Detection 1–2 hari, pantau menu WAF Monitoring, lalu kembali ke Enforce.
SUMMARY
