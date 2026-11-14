<template>
  <div class="page-content">
    <div class="section-header">
      <div>
        <h3>Access Logs</h3>
        <p class="section-desc">Pantau lalu lintas HTTP & akses reverse proxy Nginx secara real-time</p>
      </div>
    </div>

    <!-- Filter & Action Toolbar -->
    <div class="card access-logs-toolbar" style="margin-bottom: 20px; padding: 16px 20px;">
      <div class="logs-toolbar-row">
        <!-- Pilih sumber log -->
        <select
          v-model="selectedDomain"
          class="form-input logs-domain-select"
          aria-label="Sumber log"
          @change="fetchLogs"
        >
          <option value="">Semua (access.log utama)</option>
          <option v-for="d in domains" :key="d" :value="d">{{ d }}</option>
        </select>

        <!-- Search Field -->
        <div class="logs-search-wrapper">
          <div class="input-icon-wrapper">
            <Search :size="15" class="input-icon" aria-hidden="true" />
            <input
              v-model="searchQuery"
              type="text"
              class="form-input"
              placeholder="Cari IP, status HTTP, endpoint path..."
              style="padding: 8px 12px 8px 36px; font-size: 13px;"
            />
          </div>
        </div>

        <!-- Filter Badges -->
        <div class="logs-filter-group">
          <button
            class="btn btn-sm"
            :class="statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'"
            @click="statusFilter = 'all'"
          >
            Semua
          </button>
          <button
            class="btn btn-sm"
            :class="statusFilter === '2xx' ? 'btn-primary' : 'btn-secondary'"
            @click="statusFilter = '2xx'"
          >
            2xx Success
          </button>
          <button
            class="btn btn-sm"
            :class="statusFilter === '4xx' ? 'btn-primary' : 'btn-secondary'"
            @click="statusFilter = '4xx'"
          >
            4xx Error
          </button>
          <button
            class="btn btn-sm"
            :class="statusFilter === '5xx' ? 'btn-primary' : 'btn-secondary'"
            @click="statusFilter = '5xx'"
          >
            5xx Error
          </button>
        </div>

        <!-- Actions & Counter -->
        <div class="logs-actions-group">
          <span class="logs-count-badge">
            Total: <strong>{{ filteredLogs.length }}</strong> log
          </span>
          <button 
            class="btn btn-outline-danger btn-sm" 
            @click="showClearConfirm = true"
            :disabled="logs.length === 0"
            title="Hapus seluruh histori log akses"
          >
            <Trash2 :size="15" aria-hidden="true" /> Bersihkan Log
          </button>
        </div>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="table-container">
      <div v-if="loading" class="empty-state">
        <p>Memuat access logs...</p>
      </div>

      <div v-else-if="filteredLogs.length === 0" class="empty-state">
        <div class="empty-state-icon"><ScrollText :size="44" :stroke-width="1.5" /></div>
        <h3>Tidak Ada Log Ditemukan</h3>
        <p v-if="logAvailable === false">
          File log <code>{{ logFile }}</code> belum ada di server. Log akan muncul setelah domain menerima request.
        </p>
        <p v-else>Belum ada request yang tercatat atau tidak cocok dengan filter.</p>
      </div>

      <div v-else class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 140px;">Waktu</th>
              <th style="width: 130px;">Client IP</th>
              <th style="width: 80px;">Method</th>
              <th style="width: 90px;">Status</th>
              <th>Path Request</th>
              <th style="width: 90px; text-align: right;">Size</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in filteredLogs" :key="log.id">
              <td style="color: var(--text-secondary); font-size: 12px; font-family: monospace;">
                {{ log.time }}
              </td>
              <td>
                <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-size: 12px;">
                  {{ log.ip }}
                </code>
              </td>
              <td>
                <span class="badge" :class="getMethodClass(log.method)">
                  {{ log.method }}
                </span>
              </td>
              <td>
                <span class="badge" :class="getStatusClass(log.status)">
                  {{ log.status }}
                </span>
              </td>
              <td class="path-cell" :title="log.path">
                {{ log.path }}
              </td>
              <td style="text-align: right; color: var(--text-secondary); font-size: 12px;">
                {{ log.size }} B
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <ConfirmDialog
      v-if="showClearConfirm"
      title="Bersihkan Log"
      :message="`Seluruh isi log ${selectedDomain || 'access.log utama'} akan dikosongkan. Tindakan ini tidak bisa dibatalkan.`"
      :icon="Trash2"
      confirm-text="Ya, Bersihkan"
      :danger-mode="true"
      @confirm="clearLogs"
      @cancel="showClearConfirm = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/api.js'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { Trash2, Search, ScrollText } from 'lucide-vue-next'

const logs = ref([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('all')
const domains = ref([])
const selectedDomain = ref('')
const logFile = ref('')
const logAvailable = ref(null)
const showClearConfirm = ref(false)

onMounted(() => {
  fetchDomains()
  fetchLogs()
})

async function fetchDomains() {
  try {
    const res = await api.getProxies()
    domains.value = res.data.data.map(p => p.domain_name).sort()
  } catch (_) {
    domains.value = []
  }
}

async function fetchLogs() {
  loading.value = true
  try {
    const res = await api.getLogs(selectedDomain.value || undefined)
    logs.value = res.data.data
    logFile.value = res.data.log_file
    logAvailable.value = res.data.available
  } catch (err) {
    logs.value = []
    window.__toast?.(err.response?.data?.message || 'Gagal memuat log akses', 'error')
  } finally {
    loading.value = false
  }
}

async function clearLogs() {
  showClearConfirm.value = false
  try {
    await api.clearLogs(selectedDomain.value || undefined)
    window.__toast?.('Log berhasil dibersihkan', 'success')
    fetchLogs()
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal membersihkan log', 'error')
  }
}

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    // Search query
    const q = searchQuery.value.toLowerCase()
    const matchesSearch = !q ||
      log.ip.toLowerCase().includes(q) ||
      log.path.toLowerCase().includes(q) ||
      String(log.status).includes(q)

    // Status filter
    let matchesStatus = true
    if (statusFilter.value === '2xx') matchesStatus = log.status >= 200 && log.status < 300
    if (statusFilter.value === '4xx') matchesStatus = log.status >= 400 && log.status < 500
    if (statusFilter.value === '5xx') matchesStatus = log.status >= 500

    return matchesSearch && matchesStatus
  })
})

function getStatusClass(status) {
  if (status >= 200 && status < 300) return 'badge-active'
  if (status >= 400 && status < 500) return 'badge-inactive'
  if (status >= 500) return 'badge-error'
  return 'badge-inactive'
}

function getMethodClass(method) {
  if (method === 'GET') return 'badge-primary'
  if (method === 'POST') return 'badge-active'
  if (method === 'DELETE') return 'badge-error'
  return 'badge-inactive'
}
</script>
