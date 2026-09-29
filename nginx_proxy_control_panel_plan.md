# Rencana Proyek: Nginx Reverse Proxy Control Panel (Web UI)

Dokumen ini memuat arsitektur dan perencanaan untuk membangun Web UI kustom yang mengelola konfigurasi Nginx Reverse Proxy. Aplikasi ini akan menerima input domain dari pengguna dan mengarahkannya ke IP privat di dalam jaringan.

## 1. Keahlian (Skills) yang Dibutuhkan

Untuk membangun sistem ini, diperlukan perpaduan antara pengembangan web dan administrasi sistem Linux.

### Frontend (Web UI)
* **HTML/CSS/JavaScript:** Dasar pembuatan antarmuka.
* **Framework JS (Opsional tapi disarankan):** Vue.js, React, atau Svelte untuk UI yang reaktif dan interaktif.
* **Styling:** TailwindCSS atau Bootstrap untuk mempercepat desain tabel, form, dan tombol pengaturan.

### Backend (API & System Control)
* **Bahasa Pemrograman:** Node.js, Python (FastAPI/Flask), atau Go. (Go sangat direkomendasikan karena eksekusi sistemnya cepat dan aman).
* **Templating Engine:** Jinja2 (Python), EJS (Node.js), atau Go Template untuk menghasilkan file konfigurasi `.conf` Nginx secara dinamis.
* **Database Management:** SQL dasar untuk SQLite.

### System Administration (DevOps)
* **Linux Fundamental:** Manajemen *file permissions*, *ownership* (`www-data` atau user khusus).
* **Nginx Mastery:** Memahami struktur blok `server {}`, `location {}`, `proxy_pass`, dan manajemen SSL.
* **Shell Scripting:** Kemampuan backend untuk mengeksekusi perintah shell (seperti `nginx -t` dan `systemctl reload nginx`).

---

## 2. Arsitektur Agen (Agent & Component Schema)

Sistem akan beroperasi melalui interaksi empat komponen utama (Agen):

1. **Client Agent (Web UI):**
   * Berjalan di browser pengguna.
   * Menampilkan dashboard daftar proxy yang aktif.
   * Menyediakan form untuk menambah/mengedit: `Domain Name`, `Target Private IP`, `Target Port`.

2. **API Gateway Agent (Backend):**
   * Menerima request (REST API) dari Web UI.
   * Melakukan validasi input (apakah format domain benar? apakah IP valid?).
   * Menyimpan data konfigurasi ke Database.

3. **Config Generator Agent:**
   * Mengambil data dari database.
   * Menggunakan *template* untuk membuat file fisik, misalnya: `/etc/nginx/conf.d/namadomain.com.conf`.

4. **System Executor Agent:**
   * Berjalan dengan *privilege* khusus (sudoers).
   * Menjalankan `nginx -t` untuk memvalidasi file konfigurasi yang baru dibuat.
   * Jika valid, menjalankan `systemctl reload nginx`. Jika gagal, membatalkan pembuatan file dan mengembalikan *error* ke Web UI.

---

## 3. Skema Database

Karena aplikasi ini berjalan secara lokal di server Nginx tunggal, **SQLite** adalah pilihan terbaik karena tidak memerlukan instalasi server database terpisah.

**Tabel: `proxy_hosts`**

| Kolom | Tipe Data | Keterangan | 
| ----- | ----- | ----- | 
| `id` | Integer (PK) | Auto increment ID | 
| `domain_name` | String | Contoh: `app1.perusahaan.com` (Unik) | 
| `target_ip` | String | IP Privat, contoh: `10.0.0.5` | 
| `target_port` | Integer | Port layanan di IP Privat, contoh: `8080` | 
| `ssl_enabled` | Boolean | `true` jika menggunakan HTTPS, `false` untuk HTTP | 
| `status` | String | `active`, `inactive`, atau `error` | 
| `created_at` | Timestamp | Waktu konfigurasi dibuat | 
| `updated_at` | Timestamp | Waktu terakhir konfigurasi diubah | 

---

## 4. Rekomendasi Tech Stack Modern

Jika Anda ingin membangun ini dengan efisien dan ringan, berikut adalah kombinasi *stack* yang direkomendasikan:
*   **Backend:** Node.js (dengan framework Express atau Hono) atau **Go** (Golang). Keduanya ringan dan sangat cepat untuk I/O operasi file.
*   **Frontend:** HTML polos dengan **TailwindCSS** dan **Alpine.js** (atau Vue.js) agar Anda tidak perlu repot dengan proses *build* yang rumit, namun tetap mendapatkan UI yang reaktif.
*   **Database:** SQLite.

---

## 5. Pertimbangan Keamanan (Security)

*   **Autentikasi (Wajib):** Panel ini **harus** dilindungi dengan login. Gunakan JWT (JSON Web Tokens) atau session cookies.
*   **Akses Port Terbatas:** Jangan pernah mengekspos port Control Panel ini secara publik ke internet. Pastikan panel hanya bisa diakses via VPN internal atau dilindungi oleh sistem Basic Auth tambahan.
*   **Validasi Input:** Backend harus memastikan `target_ip` benar-benar IP Privat (seperti `192.168.x.x` atau `10.x.x.x`) dan memblokir upaya *Command Injection*.
*   **Hak Akses Terbatas (Principle of Least Privilege):** Backend jangan dijalankan sebagai user `root`. Buat user spesifik, dan berikan izin di `/etc/sudoers` *hanya* untuk menjalankan perintah `nginx -t` dan `systemctl reload nginx`.

---

## 6. Peta Jalan Pengembangan (Roadmap)

### Fase 1: Perancangan Inti Nginx & Backend Sederhana (Minggu 1)
* [ ] Menginstal Nginx di server Linux.
* [ ] Menyiapkan folder khusus untuk konfigurasi API (misal `/etc/nginx/panel-conf.d/`).
* [ ] Membuat server API sederhana yang bisa menerima format JSON `{"domain": "...", "ip": "..."}`.
* [ ] Membuat fungsi yang dapat menulis file `.conf` Nginx dari JSON tersebut menggunakan *templating*.

### Fase 2: Eksekusi Sistem & Database (Minggu 2)
* [ ] Menyiapkan database SQLite berdasarkan skema.
* [ ] Membuat koneksi Backend ke SQLite untuk operasi CRUD (Create, Read, Update, Delete).
* [ ] Menambahkan fungsi *System Command* di Backend untuk menjalankan `nginx -t` dan `nginx -s reload`.
* [ ] Mengonfigurasi hak akses agar Backend dapat me-reload Nginx secara aman.

### Fase 3: Pembuatan Antarmuka Pengguna / Web UI (Minggu 3)
* [ ] Membuat halaman Dashboard untuk menampilkan daftar proxy dari database.
* [ ] Membuat Form "Tambah Proxy" (Input Domain, IP, dan Port).
* [ ] Menyediakan tombol "Aktifkan/Nonaktifkan" untuk mengatur file `.conf`.
* [ ] Menyediakan fitur hapus konfigurasi.

### Fase 4: Fitur Keamanan dan SSL Otomatis (Minggu 4)
* [ ] Menambahkan sistem Login/Autentikasi (Admin User).
* [ ] Mengintegrasikan Certbot (Let's Encrypt) ke dalam Backend.
* [ ] Menambahkan *toggle* "Request SSL" di Web UI untuk memicu pembuatan sertifikat secara otomatis.
* [ ] Melakukan *security audit* dan uji coba akhir.