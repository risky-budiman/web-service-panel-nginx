#!/bin/bash
# ==============================================================================
# Test untuk scripts/setup-modsec.sh — berjalan di sandbox, TIDAK menyentuh
# /etc, /var/log, nginx, atau systemctl sungguhan.
#
#     bash tests/test-setup-modsec.sh
#
# Perintah sistem (id, nginx, systemctl, chown, git, curl) diganti stub.
# Catatan: test ini memverifikasi LOGIKA script & struktur file .conf.
# Perilaku engine ModSecurity (rule benar-benar memblokir / tidak) perlu
# diuji dengan Nginx + ModSecurity sungguhan (Docker / VM / server).
# ==============================================================================

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_DIR/scripts/setup-modsec.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# ── Stub perintah sistem ──────────────────────────────────────────────────────
STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"
cat > "$STUB_BIN/id" << 'EOF'
#!/bin/bash
[ "${1:-}" = "-u" ] && { echo "${STUB_UID:-0}"; exit 0; }
/usr/bin/id "$@"
EOF
cat > "$STUB_BIN/nginx" << 'EOF'
#!/bin/bash
echo "nginx $*" >> "$STUB_LOG"
if [ "${NGINX_STUB_FAIL:-0}" = "1" ]; then
  echo "nginx: [emerg] stub failure" >&2; exit 1
fi
echo "nginx: configuration file test is successful"
EOF
cat > "$STUB_BIN/systemctl" << 'EOF'
#!/bin/bash
echo "systemctl $*" >> "$STUB_LOG"
EOF
for c in chown git curl; do
  printf '#!/bin/bash\necho "%s $*" >> "$STUB_LOG"\n' "$c" > "$STUB_BIN/$c"
done
chmod +x "$STUB_BIN"/*

# ── Fixture: kondisi server saat ini (sesuai output yang dilaporkan) ─────────
make_fixture() {
  local root="$1"
  rm -rf "$root"; mkdir -p "$root/modsec/owasp-crs/rules" "$root/log"
  cat > "$root/modsec/modsecurity.conf" << 'EOF'
# -- Rule engine initialization ----------------------------------------------
# Enable ModSecurity, attaching it to every transaction. Use detection
# only to start with, because that minimises the chances of post-installation
# disruption.
#
SecRuleEngine On

# -- Request body handling ---------------------------------------------------
SecRequestBodyAccess On
SecRequestBodyLimit 13107200
SecRequestBodyNoFilesLimit 131072
SecRequestBodyLimitAction Reject

# -- Audit log configuration -------------------------------------------------
SecAuditEngine On
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABIJDEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/modsec_audit.log
EOF
  cat > "$root/modsec/owasp-crs/crs-setup.conf" << 'EOF'
#SecAction \
#  "id:900200,\
#  phase:1,\
#  nolog,\
#  pass,\
#  t:none,\
#  setvar:'tx.allowed_methods=GET HEAD POST OPTIONS PUT PATCH DELETE'"
EOF
  echo "# rule" > "$root/modsec/owasp-crs/rules/REQUEST-911-METHOD-ENFORCEMENT.conf"
  echo "# rule" > "$root/modsec/owasp-crs/rules/REQUEST-922-MULTIPART-ATTACK.conf"
  cat > "$root/modsec/main.conf" << 'EOF'
Include /etc/nginx/modsec/modsecurity.conf
Include /etc/nginx/modsec/owasp-crs/crs-setup.conf
Include /etc/nginx/modsec/owasp-crs/rules/*.conf
EOF
}

run_script() {
  local root="$1"; shift
  env PATH="$STUB_BIN:$PATH" STUB_LOG="$root/calls.log" \
      MODSEC_DIR="$root/modsec" AUDIT_LOG="$root/log/modsec_audit.log" \
      LOGROTATE_FILE="$root/logrotate-modsec" "$@" \
      bash "$SCRIPT" > "$root/output.log" 2>&1
}

hash_of() { md5sum "$1" 2>/dev/null | cut -d' ' -f1; }

# ==============================================================================
echo "▶ Test 1: penerapan pada kondisi server saat ini"
R="$WORK/t1"; make_fixture "$R"
run_script "$R"; rc=$?
C="$R/modsec/modsecurity.conf"
M="$R/modsec/main.conf"
check "exit code 0" "[ $rc -eq 0 ]"
check "SecAuditEngine -> RelevantOnly" "grep -qx 'SecAuditEngine RelevantOnly' '$C'"
check "SecRequestBodyNoFilesLimit -> 10485760" "grep -qx 'SecRequestBodyNoFilesLimit 10485760' '$C'"
check "SecRequestBodyLimit tidak berubah (13107200)" "grep -qx 'SecRequestBodyLimit 13107200' '$C'"
check "SecRequestBodyLimitAction tidak berubah" "grep -qx 'SecRequestBodyLimitAction Reject' '$C'"
check "SecRuleEngine On" "grep -qx 'SecRuleEngine On' '$C'"
check "SecAuditLog menunjuk ke AUDIT_LOG" "grep -qx 'SecAuditLog $R/log/modsec_audit.log' '$C'"
check "SecAuditLogRelevantStatus tidak ikut terubah" "grep -q '^SecAuditLogRelevantStatus' '$C'"
check "komentar tidak ikut terubah" "grep -q '^# Enable ModSecurity' '$C'"
check "panel-overrides.conf terpasang identik" "[ \"\$(hash_of '$R/modsec/panel-overrides.conf')\" = \"\$(hash_of '$REPO_DIR/modsec/panel-overrides.conf')\" ]"
check "panel-exclusions.conf terpasang identik" "[ \"\$(hash_of '$R/modsec/panel-exclusions.conf')\" = \"\$(hash_of '$REPO_DIR/modsec/panel-exclusions.conf')\" ]"

line_of() { grep -n "$1" "$M" | head -1 | cut -d: -f1; }
L_MS=$(line_of 'modsecurity.conf'); L_SETUP=$(line_of 'crs-setup.conf')
L_OV=$(line_of 'panel-overrides.conf'); L_EX=$(line_of 'panel-exclusions.conf')
L_RULES=$(line_of 'rules/\*.conf')
check "main.conf: urutan modsecurity < crs-setup < overrides < exclusions < rules" \
  "[ -n '$L_MS' ] && [ -n '$L_RULES' ] && [ $L_MS -lt $L_SETUP ] && [ $L_SETUP -lt $L_OV ] && [ $L_OV -lt $L_EX ] && [ $L_EX -lt $L_RULES ]"
check "main.conf: tiap file di-include tepat sekali" "[ \$(grep -c '^Include' '$M') -eq 5 ]"
check "rule 922 dinonaktifkan (.bak)" "[ ! -f '$R/modsec/owasp-crs/rules/REQUEST-922-MULTIPART-ATTACK.conf' ] && [ -f '$R/modsec/owasp-crs/rules/REQUEST-922-MULTIPART-ATTACK.conf.bak' ]"
check "rule lain tidak tersentuh" "[ -f '$R/modsec/owasp-crs/rules/REQUEST-911-METHOD-ENFORCEMENT.conf' ]"
check "logrotate dibuat untuk audit log" "grep -q '^$R/log/modsec_audit.log {' '$R/logrotate-modsec' && grep -q 'copytruncate' '$R/logrotate-modsec'"
check "audit log dibuat" "[ -f '$R/log/modsec_audit.log' ]"
check "tidak ada lagi chmod 666 di script" "! grep -q 'chmod 666' '$SCRIPT'"
check "chown www-data:adm dipanggil" "grep -q 'chown www-data:adm' '$R/calls.log'"
check "nginx -t dipanggil" "grep -q '^nginx -t' '$R/calls.log'"
check "nginx di-reload sekali" "[ \$(grep -c '^systemctl reload nginx' '$R/calls.log') -eq 1 ]"
check "tidak ada git clone / curl (CRS & conf sudah ada)" "! grep -qE '^(git|curl) ' '$R/calls.log'"
check "backup dibuat" "ls -d '$R'/modsec/.backup-* >/dev/null 2>&1 && [ -f \"\$(ls -d '$R'/modsec/.backup-* | head -1)/modsecurity.conf\" ]"

# ==============================================================================
echo "▶ Test 2: idempotent (dijalankan dua kali hasilnya sama)"
H1_C=$(hash_of "$C"); H1_M=$(hash_of "$M")
sleep 1   # backup dir memakai timestamp detik
run_script "$R"; rc=$?
check "exit code 0 pada run kedua" "[ $rc -eq 0 ]"
check "modsecurity.conf identik" "[ '$H1_C' = \"\$(hash_of '$C')\" ]"
check "main.conf identik" "[ '$H1_M' = \"\$(hash_of '$M')\" ]"
check "tidak ada duplikasi direktif" "[ \$(grep -c '^SecAuditEngine' '$C') -eq 1 ] && [ \$(grep -c '^SecRequestBodyNoFilesLimit' '$C') -eq 1 ]"

# ==============================================================================
echo "▶ Test 3: rollback jika nginx -t gagal"
R="$WORK/t3"; make_fixture "$R"
H_C=$(hash_of "$R/modsec/modsecurity.conf"); H_M=$(hash_of "$R/modsec/main.conf")
run_script "$R" NGINX_STUB_FAIL=1; rc=$?
check "exit code non-zero" "[ $rc -ne 0 ]"
check "modsecurity.conf dikembalikan" "[ '$H_C' = \"\$(hash_of '$R/modsec/modsecurity.conf')\" ]"
check "main.conf dikembalikan" "[ '$H_M' = \"\$(hash_of '$R/modsec/main.conf')\" ]"
check "panel-overrides.conf dihapus (sebelumnya tidak ada)" "[ ! -f '$R/modsec/panel-overrides.conf' ]"
check "panel-exclusions.conf dihapus (sebelumnya tidak ada)" "[ ! -f '$R/modsec/panel-exclusions.conf' ]"
check "nginx TIDAK di-reload" "! grep -q '^systemctl reload nginx' '$R/calls.log'"
check "pesan gagal ditampilkan" "grep -q 'nginx -t gagal' '$R/output.log'"

# ==============================================================================
echo "▶ Test 4: menolak dijalankan tanpa root"
R="$WORK/t4"; make_fixture "$R"
H_C=$(hash_of "$R/modsec/modsecurity.conf")
run_script "$R" STUB_UID=1000; rc=$?
check "exit code 1" "[ $rc -eq 1 ]"
check "tidak ada file yang diubah" "[ '$H_C' = \"\$(hash_of '$R/modsec/modsecurity.conf')\" ] && [ ! -f '$R/modsec/panel-overrides.conf' ]"

# ==============================================================================
echo "▶ Test 5: lint file rule ModSecurity di repo"
for f in "$REPO_DIR"/modsec/*.conf; do
  n=$(basename "$f")
  check "$n: tidak ada spasi setelah backslash penyambung baris" "! grep -nE '\\\\[[:space:]]+\$' '$f'"
  check "$n: tidak ada CRLF" "! grep -q \$'\\r' '$f'"
  check "$n: tanda kutip ganda seimbang" "[ \$(( \$(grep -v '^[[:space:]]*#' '$f' | tr -cd '\"' | wc -c) % 2 )) -eq 0 ]"
done
IDS=$(grep -hoE '"id:[0-9]+' "$REPO_DIR"/modsec/*.conf | cut -d: -f2)
check "rule id unik" "[ \$(echo \"$IDS\" | sort | uniq -d | wc -l) -eq 0 ]"
ids_in_local_range() {
  local i
  for i in $IDS; do
    { [ "$i" -ge 1000000 ] && [ "$i" -le 1999999 ]; } || return 1
  done
}
check "rule id di rentang lokal 1000000-1999999 (tidak bentrok dgn CRS)" "ids_in_local_range"
check "allowed_methods memuat PUT PATCH DELETE" \
  "grep -q \"tx.allowed_methods=GET HEAD POST OPTIONS PUT PATCH DELETE\" '$REPO_DIR/modsec/panel-overrides.conf'"

# ==============================================================================
echo "▶ Test 6: regex Host pada pengecualian GenieACS"
HOST_RX=$(grep -oE '"@rx [^"]+"' "$REPO_DIR/modsec/panel-exclusions.conf" | head -1 | sed -E 's/^"@rx //; s/"$//')
match() { printf '%s' "$1" | grep -qP "$HOST_RX"; }
for h in "acs.ids.net.id" "acs.ids.net.id:443"; do
  check "cocok: $h" "match '$h'"
done
for h in "evil-acs.ids.net.id" "acs.ids.net.id.evil.com" "ids.net.id" "xacs.ids.net.id" "acsXids.net.id"; do
  check "tidak cocok: $h" "! match '$h'"
done
check "exclusion hanya untuk ARGS:filter + tag attack-sqli" \
  "grep -q 'ctl:ruleRemoveTargetByTag=attack-sqli;ARGS:filter' '$REPO_DIR/modsec/panel-exclusions.conf'"
check "exclusion dibatasi ke path /api/" \
  "grep -q '@beginsWith /api/' '$REPO_DIR/modsec/panel-exclusions.conf'"

# ==============================================================================
echo
echo "Hasil: $PASS lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
