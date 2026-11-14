import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' }
})

// ─── Sesi (token & user di localStorage) ────────────────────
export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch (_) {
    return null
  }
}

export function setStoredUser(user) {
  localStorage.setItem('user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.__clearToasts?.()
}

// Interceptor: tambah token ke setiap request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor: 401 → login ulang, 403 PASSWORD_CHANGE_REQUIRED → halaman ganti password
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    const isLoginRequest = error.config?.url?.includes('/auth/login')

    if (status === 401 && !isLoginRequest) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.href = '/login'
    } else if (status === 403 && error.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      const user = getStoredUser() || {}
      setStoredUser({ ...user, must_change_password: true })
      if (window.location.pathname !== '/change-password') window.location.href = '/change-password'
    }
    return Promise.reject(error)
  }
)

export default {
  // Auth
  login: (username, password) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),

  // Proxies
  getProxies: () => api.get('/proxies'),
  getProxy: (id) => api.get(`/proxies/${id}`),
  createProxy: (data) => api.post('/proxies', data),
  updateProxy: (id, data) => api.put(`/proxies/${id}`, data),
  deleteProxy: (id) => api.delete(`/proxies/${id}`),
  toggleProxy: (id) => api.post(`/proxies/${id}/toggle`),

  // Stats
  getStats: () => api.get('/stats'),

  // SSL
  getSslCertificates: () => api.get('/ssl'),
  requestSsl: (proxy_id) => api.post('/ssl/request', { proxy_id }),
  toggleSsl: (id) => api.post(`/ssl/${id}/toggle`),

  // Logs
  getLogs: (domain, limit) => api.get('/logs', { params: { domain, limit } }),
  clearLogs: (domain) => api.delete('/logs/clear', { data: { domain } }),

  // ModSecurity WAF
  getWafLogs: (params) => api.get('/waf/logs', { params }),
  getWafStats: () => api.get('/waf/stats'),
  setWafMode: (id, waf_mode) => api.post(`/waf/${id}/mode`, { waf_mode }),

  // Settings
  getSystemInfo: () => api.get('/settings/system'),
  changePassword: (currentPassword, newPassword) => api.post('/settings/change-password', { currentPassword, newPassword }),
  // Backup diunduh sebagai blob lewat header Authorization (token tidak lagi di URL)
  downloadBackup: () => api.get('/settings/backup-db', { responseType: 'blob', timeout: 120000 }),
  restoreDb: (fileBuffer) => api.post('/settings/restore-db', fileBuffer, {
    headers: { 'Content-Type': 'application/octet-stream' }
  }),
  optimizeAll: () => api.post('/settings/optimize-all')
}
