# Update Aman di Server Produksi

Panduan update Nginx Proxy Panel di server yang sudah berjalan, **tanpa kehilangan data host**.
Untuk instalasi baru gunakan `deploy.sh` (lihat `DEPLOY_GUIDE.md`).

## TL;DR

```bash
cd /var/www/nginx-panel
sudo bash scripts/safe-update.sh --dry-run   # cek dulu, tidak mengubah apa pun
sudo bash scripts/safe-update.sh             # update
```

### Update pertama dari versi lama (≤ `fa317b9`)

Versi lama belum punya `scripts/safe-update.sh`, jadi ambil script-nya langsung dari git:

```bash
cd /var/www/nginx-panel
git fetch origin
git show origin/main:scripts/safe-update.sh > /tmp/safe-update.sh
sudo bash /tmp/safe-update.sh --app-dir /var/www/nginx-panel --dry-run
sudo bash /tmp/safe-update.sh --app-dir /var/www/nginx-panel
```

> ⚠️ **Jangan `git pull` manual** saat update dari versi lama: `backend/data/panel.db`
> sudah dikeluarkan dari git, sehingga `git pull` biasa bisa **menghapus database produksi**.
> `safe-update.sh` menangani ini dengan aman.

## Apa yang dilakukan `safe-update.sh`

| Tahap | Keterangan |
|---|---|
| 1. Pemeriksaan awal | Tidak mengubah apa pun. Cek file yang diubah manual di server, daftar commit baru, dan validasi semua host memakai aturan **versi baru** (`scripts/check-hosts.js`). |
| 2. Backup | Hanya **panel** yang dihentikan — Nginx & semua domain tetap online. Backup database, `.env`, JWT secret, `/etc/nginx/panel-conf.d`, `/etc/nginx/modsec` ke `/root/nginx-panel-backups/<waktu>/`. |
| 3. Pull aman | Kode diperbarui (fast-forward). Database dipulihkan dari backup dan dicocokkan byte-per-byte. |
| 4. Build | `npm ci` backend, build frontend, `scripts/setup-modsec.sh` (punya rollback sendiri). |
| 5. Start | Panel dinyalakan, health check `/api/health`, `nginx -t`. |
| 6. Rollback | Jika langkah 3–5 gagal → **otomatis** kembali ke kondisi sebelum update. |

## Opsi

| Opsi | Fungsi |
|---|---|
| `--dry-run` | Hanya pemeriksaan awal |
| `--yes` | Tanpa konfirmasi (untuk otomatisasi) |
| `--branch <nama>` | Pull branch lain (default: branch aktif di server) |
| `--app-dir <dir>` | Folder aplikasi (wajib bila script dijalankan dari luar repo) |
| `--allow-invalid-hosts` | Lanjut walau ada host yang tidak lolos validasi baru |
| `--skip-modsec` | Jangan ubah konfigurasi ModSecurity |

Variabel environment: `BACKUP_ROOT`, `PM2_NAME` (default `nginx-panel`), `NGINX_CONF_DIR`, `MODSEC_DIR`, `HEALTH_TIMEOUT`.

## Rollback manual

Setiap update membuat script rollback mandiri di folder backup-nya:

```bash
ls /root/nginx-panel-backups/
sudo bash /root/nginx-panel-backups/<waktu>/rollback.sh
```

Rollback mengembalikan kode ke commit sebelumnya, database, `.env`, config Nginx panel,
dan config ModSecurity, lalu me-reload Nginx dan menyalakan ulang panel.

## Setelah update

1. Login ke panel. Jika password masih `admin123`, Anda diminta menggantinya.
2. Buka beberapa domain di browser.
3. WAF: set domain ke mode **Detection** 1–2 hari, pantau menu **WAF Monitoring**,
   lalu kembalikan ke **Enforce**. Pengecualian false positive ditambahkan di
   `modsec/panel-exclusions.conf`, lalu jalankan `sudo bash scripts/setup-modsec.sh`.
4. Disarankan: akses panel lewat domain + HTTPS, lalu set `HOST=127.0.0.1` di `backend/.env`.

## Cek host secara manual

```bash
node scripts/check-hosts.js            # semua host lolos validasi?
```
