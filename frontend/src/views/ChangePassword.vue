<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-header-icon">🔐</div>
        <h1>Ganti Password</h1>
        <p>Akun Anda masih memakai password default. Demi keamanan, buat password baru sebelum melanjutkan.</p>
      </div>

      <div v-if="error" class="login-error">{{ error }}</div>

      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label" for="current-password">Password Saat Ini</label>
          <div class="input-icon-wrapper">
            <span class="input-icon">🔒</span>
            <input
              id="current-password"
              v-model="currentPassword"
              type="password"
              class="form-input"
              placeholder="Password yang baru saja dipakai login"
              autocomplete="current-password"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="new-password">Password Baru</label>
          <div class="input-icon-wrapper">
            <span class="input-icon">✨</span>
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              class="form-input"
              :placeholder="`Minimal ${MIN_LENGTH} karakter`"
              autocomplete="new-password"
              :minlength="MIN_LENGTH"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="confirm-password">Konfirmasi Password Baru</label>
          <div class="input-icon-wrapper">
            <span class="input-icon">🛡️</span>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              class="form-input"
              placeholder="Ketik ulang password baru"
              autocomplete="new-password"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-lg"
          style="width: 100%; justify-content: center; margin-top: 10px;"
          :disabled="loading"
        >
          <span v-if="loading" class="spinner"></span>
          <span v-else>💾 Simpan Password Baru</span>
        </button>
      </form>

      <button
        type="button"
        class="btn btn-secondary"
        style="width: 100%; justify-content: center; margin-top: 12px;"
        @click="logout"
      >
        Keluar
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api, { clearSession, getStoredUser, setStoredUser } from '../services/api.js'

const MIN_LENGTH = 10
const router = useRouter()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''

  if (newPassword.value.length < MIN_LENGTH) {
    error.value = `Password baru minimal ${MIN_LENGTH} karakter`
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Konfirmasi password tidak cocok'
    return
  }

  loading.value = true
  try {
    await api.changePassword(currentPassword.value, newPassword.value)
    const user = getStoredUser() || {}
    setStoredUser({ ...user, must_change_password: false })
    window.__toast?.('Password berhasil diganti', 'success')
    router.replace('/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal mengganti password'
  } finally {
    loading.value = false
  }
}

function logout() {
  clearSession()
  router.replace('/login')
}
</script>
