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
          <div class="sidebar-logo-icon"><Server :size="20" /></div>
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
          <X :size="18" />
        </button>
      </div>

      <nav class="sidebar-nav">
        <a
          v-for="tab in TABS"
          :key="tab.id"
          class="sidebar-nav-item"
          :class="{ active: currentTab === tab.id }"
          :href="tab.id === 'dashboard' ? '/' : `/?tab=${tab.id}`"
          :aria-current="currentTab === tab.id ? 'page' : undefined"
          @click.prevent="goToTab(tab.id)"
        >
          <component :is="tab.icon" :size="18" class="nav-icon" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-nav-item" @click="handleLogout">
          <LogOut :size="18" class="nav-icon" aria-hidden="true" />
          <span>Logout</span>
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
            <Menu :size="20" />
          </button>
          <h2 class="topbar-title">{{ activeTab.title }}</h2>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-secondary btn-sm" @click="handleRefreshAll" :disabled="loading" title="Muat ulang data halaman ini">
            <RefreshCw :size="15" :class="{ 'icon-spin': loading }" aria-hidden="true" /> <span class="btn-text">Refresh</span>
          </button>
          <button class="btn btn-primary btn-sm" v-if="currentTab === 'dashboard'" @click="showAddForm = true">
            <Plus :size="16" aria-hidden="true" /> <span class="btn-text">Tambah Proxy</span>
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
            <div class="stat-icon total"><Globe :size="22" /></div>
            <div class="stat-info">
              <h3>{{ stats.total }}</h3>
              <p>Total Proxy</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon active"><CircleCheck :size="22" /></div>
            <div class="stat-info">
              <h3>{{ stats.active }}</h3>
              <p>Active</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon inactive"><CirclePause :size="22" /></div>
            <div class="stat-info">
              <h3>{{ stats.inactive }}</h3>
              <p>Inactive</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon error"><CircleX :size="22" /></div>
            <div class="stat-info">
              <h3>{{ stats.error }}</h3>
              <p>Error</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon ssl"><Lock :size="22" /></div>
            <div class="stat-info">
              <h3>{{ stats.ssl_enabled }}</h3>
              <p>SSL Enabled</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon waf"><ShieldCheck :size="22" /></div>
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
            <div class="table-header-tools">
              <div v-if="proxies.length > 0" class="input-icon-wrapper table-search">
                <Search :size="15" class="input-icon" aria-hidden="true" />
                <input
                  v-model="searchQuery"
                  type="search"
                  class="form-input"
                  placeholder="Cari domain atau IP..."
                  aria-label="Cari proxy"
                />
              </div>
              <span class="table-count">
                {{ searchQuery ? `${filteredProxies.length} dari ${proxies.length}` : proxies.length }} entri
              </span>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loading && proxies.length === 0" style="display: flex; justify-content: center; padding: 40px;">
            <div class="spinner" style="width: 32px; height: 32px;"></div>
          </div>

          <!-- Empty State -->
          <div v-else-if="proxies.length === 0" class="empty-state">
            <div class="empty-state-icon"><Globe :size="44" :stroke-width="1.5" /></div>
            <h3>Belum ada Proxy Host</h3>
            <p>Tambahkan proxy pertama Anda untuk mulai mengarahkan domain ke server internal.</p>
            <button class="btn btn-primary" @click="showAddForm = true">
              <Plus :size="16" aria-hidden="true" /> Tambah Proxy Pertama
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
                <tr v-if="filteredProxies.length === 0">
                  <td colspan="7" class="table-empty-row">Tidak ada proxy yang cocok dengan "{{ searchQuery }}"</td>
                </tr>
                <tr
                  v-for="proxy in filteredProxies"
                  :key="proxy.id"
                  :class="{ 'row-busy': busyId === proxy.id }"
                  :aria-busy="busyId === proxy.id"
                >
                  <td class="domain-cell">
                    <a
                      :href="`${proxy.ssl_enabled ? 'https' : 'http'}://${proxy.domain_name}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="domain-link"
                      :title="`Buka ${proxy.domain_name} di tab baru`"
                    >
                      {{ proxy.domain_name }} <ExternalLink :size="12" class="domain-link-icon" aria-hidden="true" />
                    </a>
                  </td>
                  <td class="ip-cell">{{ proxy.target_ip }}:{{ proxy.target_port }}</td>
                  <td>
                    <button
                      type="button"
                      :class="['ssl-badge', proxy.ssl_enabled ? 'enabled' : 'disabled']"
                      :disabled="busyId !== null"
                      :title="proxy.ssl_enabled ? 'HTTPS aktif. Klik untuk beralih ke HTTP' : 'HTTP saja. Klik untuk mengaktifkan HTTPS / SSL'"
                      @click="sslTarget = proxy"
                    >
                      <span class="ssl-dot" :class="proxy.ssl_enabled ? 'on' : 'off'"></span>
                      {{ proxy.ssl_enabled ? 'HTTPS' : 'HTTP' }}
                    </button>
                  </td>
                  <td>
                    <select
                      class="waf-select"
                      :class="`waf-${proxy.waf_mode}`"
                      :value="proxy.waf_mode"
                      :disabled="busyId !== null"
                      :aria-label="`Mode WAF untuk ${proxy.domain_name}`"
                      @change="handleSetWaf(proxy, $event)"
                    >
                      <option value="off">Off</option>
                      <option value="detection">Detection</option>
                      <option value="on">Enforce</option>
                    </select>
                  </td>
                  <td>
                    <span :class="['status-badge', proxy.status]">
                      <span class="status-dot"></span>
                      {{ STATUS_LABELS[proxy.status] || proxy.status }}
                    </span>
                  </td>
                  <td class="date-cell">
                    {{ formatDate(proxy.created_at) }}
                  </td>
                  <td>
                    <div class="actions-cell">
                      <span v-if="busyId === proxy.id" class="spinner row-spinner" aria-label="Memproses"></span>
                      <template v-else>
                        <button
                          class="action-btn"
                          :class="proxy.status === 'active' ? '' : 'success'"
                          :disabled="busyId !== null"
                          :title="proxy.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'"
                          :aria-label="`${proxy.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'} ${proxy.domain_name}`"
                          @click="handleToggle(proxy)"
                        >
                          <Pause v-if="proxy.status === 'active'" :size="15" />
                          <Play v-else :size="15" />
                        </button>
                        <button
                          class="action-btn"
                          :disabled="busyId !== null"
                          title="Edit"
                          :aria-label="`Edit ${proxy.domain_name}`"
                          @click="startEdit(proxy)"
                        >
                          <Pencil :size="15" />
                        </button>
                        <button
                          class="action-btn danger"
                          :disabled="busyId !== null"
                          title="Hapus"
                          :aria-label="`Hapus ${proxy.domain_name}`"
                          @click="confirmDelete(proxy)"
                        >
                          <Trash2 :size="15" />
                        </button>
                      </template>
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
      :icon="Trash2"
      confirm-text="Ya, Hapus"
      :danger-mode="true"
      @confirm="executeDelete"
      @cancel="deleteTarget = null"
    />

    <ConfirmDialog
      v-if="sslTarget"
      :title="sslTarget.ssl_enabled ? 'Nonaktifkan HTTPS' : 'Aktifkan HTTPS'"
      :message="sslTarget.ssl_enabled
        ? `Domain '${sslTarget.domain_name}' akan dilayani lewat HTTP biasa (tanpa enkripsi). Lanjutkan?`
        : `Panel akan meminta sertifikat Let's Encrypt untuk '${sslTarget.domain_name}' bila belum ada. Pastikan DNS domain sudah mengarah ke server ini. Proses bisa memakan waktu hingga 1 menit.`"
      :icon="sslTarget.ssl_enabled ? LockOpen : Lock"
      :tone="sslTarget.ssl_enabled ? 'danger' : 'primary'"
      :confirm-text="sslTarget.ssl_enabled ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan HTTPS'"
      :danger-mode="Boolean(sslTarget.ssl_enabled)"
      @confirm="executeToggleSsl"
      @cancel="sslTarget = null"
    />

    <ConfirmDialog
      v-if="wafTarget"
      title="Aktifkan WAF Enforce"
      :message="`Mode Enforce akan MEMBLOKIR (403) request yang dianggap serangan ke '${wafTarget.proxy.domain_name}'. Disarankan memakai mode Detection terlebih dahulu dan memeriksa WAF Monitoring untuk false positive.`"
      :icon="ShieldCheck"
      tone="warning"
      confirm-text="Ya, Aktifkan Enforce"
      @confirm="executeSetWaf"
      @cancel="wafTarget = null"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { clearSession } from '../services/api.js'
import ProxyForm from '../components/ProxyForm.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import {
  Server, X, Menu, LogOut, RefreshCw, Plus, Search, ExternalLink, Globe, CircleCheck, CirclePause,
  CircleX, Lock, LockOpen, ShieldCheck, Shield, Pause, Play, Pencil, Trash2, LayoutDashboard,
  ScrollText, Settings as SettingsIcon
} from 'lucide-vue-next'

// Halaman lain dimuat hanya saat dibuka (bundle awal lebih kecil)
const SslCertificates = defineAsyncComponent(() => import('./SslCertificates.vue'))
const WafMonitoring = defineAsyncComponent(() => import('./WafMonitoring.vue'))
const AccessLogs = defineAsyncComponent(() => import('./AccessLogs.vue'))
const Settings = defineAsyncComponent(() => import('./Settings.vue'))

const TABS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', title: 'Dashboard Proxy' },
  { id: 'ssl', icon: Lock, label: 'SSL Certificates', title: 'Sertifikat SSL' },
  { id: 'waf', icon: Shield, label: 'WAF Monitoring', title: 'WAF & Security Monitoring' },
  { id: 'logs', icon: ScrollText, label: 'Access Logs', title: 'Nginx Access Logs' },
  { id: 'settings', icon: SettingsIcon, label: 'Settings', title: 'Pengaturan Sistem' }
]
const STATUS_LABELS = { active: 'Aktif', inactive: 'Nonaktif', error: 'Error' }
const WAF_LABELS = { off: 'Off', detection: 'Detection', on: 'Enforce' }

const route = useRoute()
const router = useRouter()

// Tab aktif disimpan di URL (?tab=...) → bisa di-refresh, di-bookmark, dan tombol Back berfungsi
const currentTab = computed(() => {
  const tab = route.query.tab
  return TABS.some(t => t.id === tab) ? tab : 'dashboard'
})
const activeTab = computed(() => TABS.find(t => t.id === currentTab.value))

const refreshKey = ref(0)
const sidebarOpen = ref(false)

const proxies = ref([])
const stats = reactive({ total: 0, active: 0, inactive: 0, error: 0, ssl_enabled: 0, waf_active: 0 })
const loading = ref(true)
const showAddForm = ref(false)
const editProxy = ref(null)
const deleteTarget = ref(null)
const sslTarget = ref(null)
const wafTarget = ref(null)
const busyId = ref(null)
const searchQuery = ref('')

const filteredProxies = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return proxies.value
  return proxies.value.filter(p =>
    p.domain_name.toLowerCase().includes(q) ||
    `${p.target_ip}:${p.target_port}`.includes(q)
  )
})

function goToTab(id) {
  sidebarOpen.value = false
  if (id === currentTab.value) return
  router.push({ query: id === 'dashboard' ? {} : { tab: id } })
}

watch(currentTab, (tab) => {
  document.title = `${activeTab.value.title} · Nginx Proxy Panel`
  if (tab === 'dashboard') fetchData()
}, { immediate: false })

onMounted(() => {
  document.title = `${activeTab.value.title} · Nginx Proxy Panel`
  fetchData()
})

async function handleRefreshAll() {
  if (currentTab.value === 'dashboard') {
    const ok = await fetchData()
    if (ok) window.__toast?.('Data berhasil diperbarui', 'info')
  } else {
    refreshKey.value++
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res = await api.getProxies()
    proxies.value = res.data.data
    Object.assign(stats, res.data.stats)
    return true
  } catch (err) {
    if (![401, 403].includes(err.response?.status)) {
      window.__toast?.(errorMessage(err, 'Gagal memuat data proxy'), 'error')
    }
    return false
  } finally {
    loading.value = false
  }
}

/** Pesan error dari server (mis. alasan Nginx menolak config) bila tersedia */
function errorMessage(err, fallback) {
  if (err.code === 'ECONNABORTED') return 'Server terlalu lama merespons. Cek kembali beberapa saat lagi.'
  if (!err.response) return 'Tidak dapat terhubung ke server panel'
  return err.response.data?.message || fallback
}

/** Jalankan aksi untuk satu baris; tombol baris lain terkunci selama proses */
async function runRowAction(proxy, action, fallbackError) {
  if (busyId.value !== null) return
  busyId.value = proxy.id
  try {
    const res = await action()
    window.__toast?.(res.data.message, 'success')
  } catch (err) {
    window.__toast?.(errorMessage(err, fallbackError), 'error', 7000)
  } finally {
    busyId.value = null
    fetchData()
  }
}

function startEdit(proxy) {
  editProxy.value = { ...proxy }
}

function confirmDelete(proxy) {
  deleteTarget.value = proxy
}

function executeDelete() {
  const proxy = deleteTarget.value
  deleteTarget.value = null
  runRowAction(proxy, () => api.deleteProxy(proxy.id), 'Gagal menghapus proxy')
}

function handleToggle(proxy) {
  runRowAction(proxy, () => api.toggleProxy(proxy.id), 'Gagal mengubah status')
}

function executeToggleSsl() {
  const proxy = sslTarget.value
  sslTarget.value = null
  runRowAction(proxy, () => api.toggleSsl(proxy.id), 'Gagal mengubah status SSL')
}

function handleSetWaf(proxy, event) {
  const mode = event.target.value
  // Kembalikan pilihan sampai perubahan benar-benar berhasil di server
  event.target.value = proxy.waf_mode
  if (mode === proxy.waf_mode) return
  if (mode === 'on') {
    wafTarget.value = { proxy, mode }
    return
  }
  runRowAction(proxy, () => api.setWafMode(proxy.id, mode), `Gagal mengubah mode WAF ke ${WAF_LABELS[mode]}`)
}

function executeSetWaf() {
  const { proxy, mode } = wafTarget.value
  wafTarget.value = null
  runRowAction(proxy, () => api.setWafMode(proxy.id, mode), `Gagal mengubah mode WAF ke ${WAF_LABELS[mode]}`)
}

function handleLogout() {
  clearSession()
  router.push('/login')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  // SQLite CURRENT_TIMESTAMP disimpan dalam UTC tanpa zona waktu
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(dateStr) ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>
