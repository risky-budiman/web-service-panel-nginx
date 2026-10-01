<template>
  <div class="app-layout">
    <!-- Mobile Sidebar Backdrop Overlay -->
    <div
      v-if="sidebarOpen"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    ></div>

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">🖥️</div>
          <div class="sidebar-logo-text">
            <h1>Nginx Panel</h1>
            <span>Control Center</span>
          </div>
        </div>
        <!-- Close button on mobile -->
        <button
          class="mobile-close-btn"
          @click="sidebarOpen = false"
          title="Tutup Menu"
        >
          ✕
        </button>
      </div>

      <nav class="sidebar-nav">
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'dashboard' }"
          href="#"
          @click.prevent="currentTab = 'dashboard'; sidebarOpen = false"
        >
          📊 Dashboard
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'ssl' }"
          href="#"
          @click.prevent="currentTab = 'ssl'; sidebarOpen = false"
        >
          🔒 SSL Certificates
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'waf' }"
          href="#"
          @click.prevent="currentTab = 'waf'; sidebarOpen = false"
        >
          🛡️ WAF Monitoring
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'logs' }"
          href="#"
          @click.prevent="currentTab = 'logs'; sidebarOpen = false"
        >
          📋 Access Logs
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'settings' }"
          href="#"
          @click.prevent="currentTab = 'settings'; sidebarOpen = false"
        >
          ⚙️ Settings
        </a>
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-nav-item" @click="handleLogout">
          🚪 Logout
        </button>
      </div>
    </aside>

    <!-- Main -->
    <main class="main-content">
      <!-- Top Bar -->
      <header class="topbar">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button
            class="mobile-menu-btn"
            @click="sidebarOpen = true"
            title="Buka Menu"
          >
            ☰
          </button>
          <h2 class="topbar-title">
            <span v-if="currentTab === 'dashboard'">📊 Dashboard Proxy</span>
            <span v-else-if="currentTab === 'ssl'">🔒 Sertifikat SSL</span>
            <span v-else-if="currentTab === 'waf'">🛡️ WAF & Security Monitoring</span>
            <span v-else-if="currentTab === 'logs'">📋 Nginx Access Logs</span>
            <span v-else-if="currentTab === 'settings'">⚙️ Pengaturan Sistem</span>
          </h2>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-secondary btn-sm" @click="handleRefreshAll" :disabled="loading">
            🔄 <span class="btn-text">Refresh</span>
          </button>
          <button class="btn btn-primary btn-sm" v-if="currentTab === 'dashboard'" @click="showAddForm = true">
            ➕ <span class="btn-text">Tambah Proxy</span>
          </button>
        </div>
      </header>

      <!-- View: SSL Certificates -->
      <SslCertificates v-if="currentTab === 'ssl'" :key="'ssl-' + refreshKey" />

      <!-- View: WAF Monitoring -->
      <WafMonitoring v-else-if="currentTab === 'waf'" :key="'waf-' + refreshKey" />

      <!-- View: Access Logs -->
      <AccessLogs v-else-if="currentTab === 'logs'" :key="'logs-' + refreshKey" />

      <!-- View: Settings -->
      <Settings v-else-if="currentTab === 'settings'" :key="'settings-' + refreshKey" />

      <!-- View: Dashboard Main Content -->
      <div v-else class="page-content">
        <!-- Stats Cards -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon total">📦</div>
            <div class="stat-info">
              <h3>{{ stats.total }}</h3>
              <p>Total Proxy</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon active">✅</div>
            <div class="stat-info">
              <h3>{{ stats.active }}</h3>
              <p>Active</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon inactive">⏸️</div>
            <div class="stat-info">
              <h3>{{ stats.inactive }}</h3>
              <p>Inactive</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon error">❌</div>
            <div class="stat-info">
              <h3>{{ stats.error }}</h3>
              <p>Error</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon ssl">🔒</div>
            <div class="stat-info">
              <h3>{{ stats.ssl_enabled }}</h3>
              <p>SSL Enabled</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">🛡️</div>
            <div class="stat-info">
              <h3>{{ stats.waf_active || 0 }}</h3>
              <p>WAF Active</p>
            </div>
          </div>
        </div>

        <!-- Proxy Table -->
        <div class="table-container">
          <div class="table-header">
            <h2>Proxy Hosts</h2>
            <span style="font-size: 13px; color: var(--text-muted);">
              {{ proxies.length }} entri
            </span>
          </div>

          <!-- Loading -->
          <div v-if="loading" style="display: flex; justify-content: center; padding: 40px;">
            <div class="spinner" style="width: 32px; height: 32px;"></div>
          </div>

          <!-- Empty State -->
          <div v-else-if="proxies.length === 0" class="empty-state">
            <div class="empty-state-icon">🌐</div>
            <h3>Belum ada Proxy Host</h3>
            <p>Tambahkan proxy pertama Anda untuk mulai mengarahkan domain ke server internal.</p>
            <button class="btn btn-primary" @click="showAddForm = true">
              ➕ Tambah Proxy Pertama
            </button>
          </div>

          <!-- Table -->
          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Target</th>
                  <th>SSL</th>
                  <th>WAF Mode</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="proxy in proxies" :key="proxy.id">
                  <td class="domain-cell">{{ proxy.domain_name }}</td>
                  <td class="ip-cell">{{ proxy.target_ip }}:{{ proxy.target_port }}</td>
                  <td>
                    <button
                      type="button"
                      :class="['ssl-badge', proxy.ssl_enabled ? 'enabled' : 'disabled']"
                      style="cursor: pointer; border-radius: 20px;"
                      :title="proxy.ssl_enabled ? 'Enkripsi HTTPS Aktif. Klik untuk beralih ke HTTP' : 'HTTP Saja. Klik untuk aktifkan HTTPS / SSL'"
                      @click="handleToggleSsl(proxy)"
                    >
                      <span 
                        style="width: 6px; height: 6px; border-radius: 50%; display: inline-block;" 
                        :style="{ background: proxy.ssl_enabled ? '#34d399' : '#94a3b8' }"
                      ></span>
                      {{ proxy.ssl_enabled ? 'HTTPS' : 'HTTP' }}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      v-if="proxy.waf_mode === 'on'"
                      class="badge"
                      style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); cursor: pointer; transition: transform 0.15s;"
                      title="Status: Aktif Enforce (Blokir). Klik untuk ubah ke Off"
                      @click="handleCycleWaf(proxy)"
                    >
                      🛡️ Enforce
                    </button>
                    <button
                      type="button"
                      v-else-if="proxy.waf_mode === 'detection'"
                      class="badge"
                      style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); cursor: pointer; transition: transform 0.15s;"
                      title="Status: Detection Only (Log saja). Klik untuk ubah ke Enforce (Blokir)"
                      @click="handleCycleWaf(proxy)"
                    >
                      ⚠️ Detection
                    </button>
                    <button
                      type="button"
                      v-else
                      class="badge"
                      style="background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); cursor: pointer; transition: transform 0.15s;"
                      title="Status: WAF Off. Klik untuk aktifkan ke Detection Only"
                      @click="handleCycleWaf(proxy)"
                    >
                      Off
                    </button>
                  </td>
                  <td>
                    <span :class="['status-badge', proxy.status]">
                      <span class="status-dot"></span>
                      {{ proxy.status }}
                    </span>
                  </td>
                  <td style="color: var(--text-muted); font-size: 13px;">
                    {{ formatDate(proxy.created_at) }}
                  </td>
                  <td>
                    <div class="actions-cell">
                      <button
                        class="action-btn"
                        :class="proxy.status === 'active' ? '' : 'success'"
                        :title="proxy.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'"
                        @click="handleToggle(proxy)"
                      >
                        {{ proxy.status === 'active' ? '⏸️' : '▶️' }}
                      </button>
                      <button
                        class="action-btn"
                        title="Edit"
                        @click="startEdit(proxy)"
                      >
                        ✏️
                      </button>
                      <button
                        class="action-btn danger"
                        title="Hapus"
                        @click="confirmDelete(proxy)"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <!-- Modals -->
    <ProxyForm
      v-if="showAddForm"
      @close="showAddForm = false"
      @saved="fetchData"
    />

    <ProxyForm
      v-if="editProxy"
      :proxy="editProxy"
      @close="editProxy = null"
      @saved="fetchData"
    />

    <ConfirmDialog
      v-if="deleteTarget"
      title="Hapus Proxy"
      :message="`Anda yakin ingin menghapus proxy '${deleteTarget.domain_name}'? Tindakan ini tidak bisa dibatalkan.`"
      icon="🗑️"
      confirm-text="Ya, Hapus"
      :danger-mode="true"
      @confirm="executeDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api.js'
import ProxyForm from '../components/ProxyForm.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SslCertificates from './SslCertificates.vue'
import WafMonitoring from './WafMonitoring.vue'
import AccessLogs from './AccessLogs.vue'
import Settings from './Settings.vue'

const router = useRouter()
const currentTab = ref('dashboard')
const refreshKey = ref(0)
const sidebarOpen = ref(false)

const proxies = ref([])
const stats = reactive({ total: 0, active: 0, inactive: 0, error: 0, ssl_enabled: 0 })
const loading = ref(true)
const showAddForm = ref(false)
const editProxy = ref(null)
const deleteTarget = ref(null)

onMounted(() => {
  fetchData()
})

function handleRefreshAll() {
  refreshKey.value++
  fetchData()
  window.__toast?.('Data berhasil diperbarui', 'info')
}

async function fetchData() {
  loading.value = true
  try {
    const res = await api.getProxies()
    proxies.value = res.data.data
    Object.assign(stats, res.data.stats)
  } catch (err) {
    window.__toast?.('Gagal memuat data', 'error')
  } finally {
    loading.value = false
  }
}

function startEdit(proxy) {
  editProxy.value = { ...proxy }
}

function confirmDelete(proxy) {
  deleteTarget.value = proxy
}

async function executeDelete() {
  try {
    await api.deleteProxy(deleteTarget.value.id)
    window.__toast?.(`Proxy '${deleteTarget.value.domain_name}' berhasil dihapus`, 'success')
    deleteTarget.value = null
    fetchData()
  } catch (err) {
    window.__toast?.('Gagal menghapus proxy', 'error')
  }
}

async function handleToggle(proxy) {
  try {
    const res = await api.toggleProxy(proxy.id)
    window.__toast?.(res.data.message, 'success')
    fetchData()
  } catch (err) {
    window.__toast?.('Gagal mengubah status', 'error')
  }
}

async function handleToggleSsl(proxy) {
  try {
    const res = await api.toggleSsl(proxy.id)
    window.__toast?.(res.data.message, 'success')
    fetchData()
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal mengubah status SSL', 'error')
  }
}

async function handleCycleWaf(proxy) {
  // Siklus pergantian mode: off -> detection -> on -> off
  const nextMode = proxy.waf_mode === 'off' ? 'detection' : (proxy.waf_mode === 'detection' ? 'on' : 'off')
  try {
    const res = await api.setWafMode(proxy.id, nextMode)
    window.__toast?.(res.data.message, 'success')
    fetchData()
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal mengubah mode WAF', 'error')
  }
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>
