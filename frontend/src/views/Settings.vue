<template>
  <div class="page-content">
    <div class="section-header">
      <div>
        <h3>⚙️ Pengaturan & Status Sistem</h3>
        <p class="section-desc">Konfigurasi panel kontrol, keamanan akun, cadangan, dan pemulihan basis data</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px;">
      <!-- System Info Card -->
      <div class="card">
        <h4 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span>🖥️</span> Informasi Server & Nginx
        </h4>
        <div v-if="loading" style="color: var(--text-secondary); padding: 12px 0;">
          Memuat informasi sistem...
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 12px; font-size: 14px;">
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-secondary);">Sistem Operasi</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ system.os || '-' }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-secondary);">Node.js Runtime</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ system.node_version || '-' }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-secondary);">Memori (RAM)</span>
            <span style="color: var(--text-primary); font-weight: 500;">Free: {{ system.memory?.free }} / Total: {{ system.memory?.total }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-secondary);">Nginx Config Directory</span>
            <code style="color: var(--accent-primary); font-size: 12px;">{{ system.nginx_conf_dir || '-' }}</code>
          </div>
          <div style="display: flex; justify-content: space-between; padding-bottom: 8px;">
            <span style="color: var(--text-secondary);">Database File</span>
            <code style="color: var(--accent-success); font-size: 12px;">panel.db (SQLite)</code>
          </div>
        </div>
      </div>

      <!-- Backup & Restore Database Card -->
      <div class="card">
        <h4 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span>💾</span> Backup & Restore Basis Data
        </h4>
        <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">
          Unduh cadangan berkas database sewaktu-waktu atau pulihkan (restore) data dari file cadangan <code>.db</code> sebelumnya.
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button class="btn btn-secondary" @click="downloadBackup" style="width: 100%; justify-content: center;">
            📥 Download Backup (panel.db)
          </button>

          <div style="position: relative; border-top: 1px dashed var(--border-color); padding-top: 12px;">
            <input
              type="file"
              ref="fileInput"
              accept=".db"
              style="display: none;"
              @change="handleRestoreFile"
            />
            <button
              class="btn btn-primary"
              :disabled="restoring"
              @click="$refs.fileInput.click()"
              style="width: 100%; justify-content: center;"
            >
              <span v-if="restoring" class="spinner"></span>
              <span v-else>📤</span>
              {{ restoring ? 'Memulihkan Data...' : 'Pulihkan Database (Restore .db)' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Change Password Card -->
      <div class="card" style="grid-column: 1 / -1;">
        <h4 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <span>🔐</span> Ubah Password Akun Admin
        </h4>
        <form @submit.prevent="handleChangePassword" style="max-width: 500px; display: flex; flex-direction: column; gap: 18px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Password Saat Ini</label>
            <div class="input-icon-wrapper">
              <span class="input-icon">🔒</span>
              <input
                v-model="pwdForm.currentPassword"
                type="password"
                class="form-input"
                placeholder="Masukkan password saat ini"
                required
              />
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Password Baru</label>
            <div class="input-icon-wrapper">
              <span class="input-icon">✨</span>
              <input
                v-model="pwdForm.newPassword"
                type="password"
                class="form-input"
                placeholder="Minimal 6 karakter"
                required
              />
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Konfirmasi Password Baru</label>
            <div class="input-icon-wrapper">
              <span class="input-icon">🛡️</span>
              <input
                v-model="pwdForm.confirmPassword"
                type="password"
                class="form-input"
                placeholder="Ketik ulang password baru"
                required
              />
            </div>
          </div>
          <div style="margin-top: 6px;">
            <button type="submit" class="btn btn-primary" :disabled="pwdLoading">
              <span v-if="pwdLoading" class="spinner"></span>
              {{ pwdLoading ? 'Menyimpan...' : '💾 Perbarui Password' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../services/api.js'

const system = ref({})
const loading = ref(true)
const pwdLoading = ref(false)
const restoring = ref(false)
const fileInput = ref(null)

const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

onMounted(() => {
  fetchSystemInfo()
})

async function fetchSystemInfo() {
  loading.value = true
  try {
    const res = await api.getSystemInfo()
    system.value = res.data.data
  } catch (err) {
    window.__toast?.('Gagal memuat info sistem', 'error')
  } finally {
    loading.value = false
  }
}

function downloadBackup() {
  const token = localStorage.getItem('token')
  const url = `${api.backupDbUrl}?token=${token}`
  window.open(url, '_blank')
}

async function handleRestoreFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.name.endsWith('.db')) {
    window.__toast?.('File harus berekstensi .db', 'error')
    return
  }

  if (!confirm(`Apakah Anda yakin ingin memulihkan database dari '${file.name}'? Data saat ini akan ditimpa dengan data cadangan ini.`)) {
    event.target.value = ''
    return
  }

  restoring.value = true
  try {
    const arrayBuffer = await file.arrayBuffer()
    const res = await api.restoreDb(arrayBuffer)
    window.__toast?.(res.data?.message || 'Database berhasil dipulihkan!', 'success')
    fetchSystemInfo()
    // Muat ulang halaman setelah 1 detik agar semua state aplikasi ter-refresh
    setTimeout(() => {
      window.location.reload()
    }, 1200)
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal memulihkan database', 'error')
  } finally {
    restoring.value = false
    event.target.value = ''
  }
}

async function handleChangePassword() {
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    window.__toast?.('Konfirmasi password tidak cocok', 'error')
    return
  }

  pwdLoading.value = true
  try {
    const res = await api.changePassword(pwdForm.currentPassword, pwdForm.newPassword)
    window.__toast?.(res.data.message || 'Password berhasil diperbarui', 'success')
    pwdForm.currentPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal mengubah password', 'error')
  } finally {
    pwdLoading.value = false
  }
}
</script>
