<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-header-icon">🖥️</div>
        <h1>Nginx Proxy Panel</h1>
        <p>Masuk ke Control Panel</p>
      </div>

      <div v-if="error" class="login-error">{{ error }}</div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label" for="username">Username</label>
          <div class="input-icon-wrapper">
            <span class="input-icon">👤</span>
            <input
              id="username"
              v-model="username"
              type="text"
              class="form-input"
              placeholder="Masukkan username admin"
              autocomplete="username"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <div class="input-icon-wrapper">
            <span class="input-icon">🔑</span>
            <input
              id="password"
              v-model="password"
              type="password"
              class="form-input"
              placeholder="Masukkan kata sandi"
              autocomplete="current-password"
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
          <span v-else>🔐 Masuk ke Panel</span>
        </button>
      </form>

      <p
        v-if="isDev"
        style="text-align: center; margin-top: 20px; font-size: 12px; color: var(--text-muted); background: rgba(255, 255, 255, 0.03); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px dashed var(--border-color);"
      >
        🛠️ <em>Mode Dev: admin / admin123</em>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api.js'

const isDev = import.meta.env.DEV
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    const res = await api.login(username.value, password.value)
    localStorage.setItem('token', res.data.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.data.user))
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal terhubung ke server'
  } finally {
    loading.value = false
  }
}
</script>
