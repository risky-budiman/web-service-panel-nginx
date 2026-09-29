<template>
  <div class="page-content">
    <div class="section-header">
      <div>
        <h3>📋 Access Logs</h3>
        <p class="section-desc">Pantau lalu lintas HTTP & akses reverse proxy Nginx secara real-time</p>
      </div>
    </div>

    <!-- Filter & Action Toolbar -->
    <div class="card" style="margin-bottom: 20px; padding: 16px 20px;">
      <div style="display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
        <!-- Left: Search and Status Badges -->
        <div style="display: flex; gap: 12px; align-items: center; flex: 1; min-width: 300px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 220px; max-width: 380px;">
            <div class="input-icon-wrapper">
              <span class="input-icon">🔍</span>
              <input
                v-model="searchQuery"
                type="text"
                class="form-input"
                placeholder="Cari IP, status HTTP, endpoint path..."
                style="padding: 8px 12px 8px 36px; font-size: 13px;"
              />
            </div>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
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
        </div>

        <!-- Right: Actions & Log Counter -->
        <div style="display: flex; align-items: center; gap: 14px; margin-left: auto;">
          <span style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
            Total: <strong style="color: var(--text-primary);">{{ filteredLogs.length }}</strong> log
          </span>
          <button 
            class="btn btn-outline-danger btn-sm" 
            @click="clearLogs"
            :disabled="logs.length === 0"
            title="Hapus seluruh histori log akses"
          >
            🗑️ Bersihkan Log
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
        <div class="empty-state-icon">📋</div>
        <h3>Tidak Ada Log Ditemukan</h3>
        <p>Belum ada request yang tercatat atau tidak cocok dengan filter.</p>
      </div>

      <table v-else class="data-table">
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
            <td style="color: var(--text-primary); font-family: monospace; font-size: 13px;">
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/api.js'

const logs = ref([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('all')

onMounted(() => {
  fetchLogs()
})

async function fetchLogs() {
  loading.value = true
  try {
    const res = await api.getLogs()
    logs.value = res.data.data
  } catch (err) {
    window.__toast?.('Gagal memuat log akses', 'error')
  } finally {
    loading.value = false
  }
}

async function clearLogs() {
  if (!confirm('Anda yakin ingin membersihkan seluruh catatan log?')) return
  try {
    await api.clearLogs()
    window.__toast?.('Log berhasil dibersihkan', 'success')
    fetchLogs()
  } catch (err) {
    window.__toast?.('Gagal membersihkan log', 'error')
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
