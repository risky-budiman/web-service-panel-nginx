<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">🖥️</div>
          <div class="sidebar-logo-text">
            <h1>Nginx Panel</h1>
            <span>Control Center</span>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'dashboard' }"
          href="#"
          @click.prevent="currentTab = 'dashboard'"
        >
          📊 Dashboard
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'ssl' }"
          href="#"
          @click.prevent="currentTab = 'ssl'"
        >
          🔒 SSL Certificates
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'logs' }"
          href="#"
          @click.prevent="currentTab = 'logs'"
        >
          📋 Access Logs
        </a>
        <a
          class="sidebar-nav-item"
          :class="{ active: currentTab === 'settings' }"
          href="#"
          @click.prevent="currentTab = 'settings'"
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
        <h2 class="topbar-title">
          <span v-if="currentTab === 'dashboard'">📊 Dashboard Proxy</span>
          <span v-else-if="currentTab === 'ssl'">🔒 Sertifikat SSL</span>
          <span v-else-if="currentTab === 'logs'">📋 Nginx Access Logs</span>
          <span v-else-if="currentTab === 'settings'">⚙️ Pengaturan Sistem</span>
        </h2>
        <div class="topbar-actions">
          <button class="btn btn-secondary btn-sm" @click="handleRefreshAll" :disabled="loading">
            🔄 Refresh
          </button>
          <button class="btn btn-primary" v-if="currentTab === 'dashboard'" @click="showAddForm = true">
            ➕ Tambah Proxy
          </button>
        </div>
      </header>

      <!-- View: SSL Certificates -->
      <SslCertificates v-if="currentTab === 'ssl'" :key="'ssl-' + refreshKey" />

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
                    <span :class="['ssl-badge', proxy.ssl_enabled ? 'enabled' : 'disabled']">
                      {{ proxy.ssl_enabled ? '🔒 HTTPS' : '🔓 HTTP' }}
                    </span>
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
import AccessLogs from './AccessLogs.vue'
import Settings from './Settings.vue'

const router = useRouter()
const currentTab = ref('dashboard')
const refreshKey = ref(0)

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
