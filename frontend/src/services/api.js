import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor: tambah token ke setiap request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor: handle 401 (token expired)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
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
  backupDbUrl: '/api/settings/backup-db',
  restoreDb: (fileBuffer) => api.post('/settings/restore-db', fileBuffer, {
    headers: { 'Content-Type': 'application/octet-stream' }
  }),
  optimizeAll: () => api.post('/settings/optimize-all')
}
