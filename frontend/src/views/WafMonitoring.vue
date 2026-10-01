<template>
  <div class="page-content">
    <!-- Header Section -->
    <div class="section-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
      <div>
        <h2 style="font-size: 22px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span>🛡️</span> Web Application Firewall (WAF)
        </h2>
        <p class="section-desc" style="color: var(--text-secondary); font-size: 14px;">
          Monitoring real-time deteksi ancaman, audit log OWASP Core Rule Set (CRS), dan status proteksi ModSecurity
        </p>
      </div>
      
      <!-- Top Action Toolbar -->
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <button 
          :class="['btn btn-sm', autoRefresh ? 'btn-primary' : 'btn-secondary']"
          @click="toggleAutoRefresh"
          style="display: flex; align-items: center; gap: 6px;"
        >
          <span :style="{ display: 'inline-block', transform: autoRefresh ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }">⚡</span>
          {{ autoRefresh ? 'Live Polling (5s)' : 'Auto Refresh Off' }}
        </button>

        <button class="btn btn-secondary btn-sm" @click="fetchData(false)" :disabled="loading" style="display: flex; align-items: center; gap: 6px;">
          <span>🔄</span> {{ loading ? 'Memuat...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Alert Status Log Server (Jika belum di Linux / log kosong) -->
    <div v-if="!logData.available" class="card" style="margin-bottom: 20px; border-left: 4px solid var(--accent-warning); background: rgba(245, 158, 11, 0.05); padding: 16px 20px;">
      <div style="display: flex; gap: 14px; align-items: flex-start;">
        <div style="font-size: 22px; line-height: 1;">💡</div>
        <div>
          <h4 style="font-size: 14px; font-weight: 600; color: var(--accent-warning); margin-bottom: 4px;">
            Status Server ModSecurity
          </h4>
          <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 0;">
            Log audit ModSecurity (<code>/var/log/modsec_audit.log</code>) belum memiliki data atau sistem sedang berjalan di mode local development. 
            Di server Linux production, log otomatis terisi saat ModSecurity aktif mendeteksi trafik serangan.
          </p>
        </div>
      </div>
    </div>

    <!-- Stats Grid Cards -->
    <div class="stats-grid" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">🚨</div>
        <div class="stat-info">
          <h3>{{ stats.total_attacks || 0 }}</h3>
          <p>Total Serangan Terdeteksi</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">🎯</div>
        <div class="stat-info">
          <h3>{{ stats.top_domains?.length || 0 }}</h3>
          <p>Target Domain Diserang</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(168, 85, 247, 0.15); color: #a855f7;">🛑</div>
        <div class="stat-info">
          <h3 style="font-size: 18px; line-height: 28px;">
            {{ stats.top_rules?.[0]?.key ? (stats.top_rules[0].key.split('(')[1]?.replace(')', '') || 'None') : 'None' }}
          </h3>
          <p>Top Threat Rule ID</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">🛡️</div>
        <div class="stat-info">
          <h3 style="font-size: 18px; line-height: 28px; color: #10b981;">OWASP CRS</h3>
          <p>WAF Engine Active</p>
        </div>
      </div>
    </div>

    <!-- Top Attackers & Frequent Rules Section -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 24px;">
      <!-- Top Attacker IPs -->
      <div class="card" style="padding: 20px;">
        <h3 style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
          <span style="display: flex; align-items: center; gap: 8px;"><span>🎯</span> Top 5 IP Penyerang</span>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">Frekuensi Serangan</span>
        </h3>
        <div v-if="!stats.top_ips || stats.top_ips.length === 0" class="empty-state" style="padding: 20px 0;">
          <p style="font-size: 13px; color: var(--text-muted);">Belum ada IP ancaman tercatat</p>
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 8px;">
          <div 
            v-for="item in stats.top_ips" 
            :key="item.key" 
            style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(21, 27, 43, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-sm);"
          >
            <span style="font-family: monospace; font-size: 13px; color: #38bdf8; font-weight: 600;">{{ item.key }}</span>
            <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">
              {{ item.count }} hits
            </span>
          </div>
        </div>
      </div>

      <!-- Top Triggered Rules -->
      <div class="card" style="padding: 20px;">
        <h3 style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
          <span style="display: flex; align-items: center; gap: 8px;"><span>📋</span> Kategori Ancaman Teratas</span>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">Aturan Terpicu</span>
        </h3>
        <div v-if="!stats.top_rules || stats.top_rules.length === 0" class="empty-state" style="padding: 20px 0;">
          <p style="font-size: 13px; color: var(--text-muted);">Belum ada rule yang ter-trigger</p>
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 8px;">
          <div 
            v-for="item in stats.top_rules" 
            :key="item.key" 
            style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(21, 27, 43, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 13px;"
          >
            <span style="color: var(--text-primary); max-width: 72%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="item.key">
              {{ item.key }}
            </span>
            <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">
              {{ item.count }}x
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter & Action Toolbar -->
    <div class="card access-logs-toolbar" style="margin-bottom: 20px; padding: 16px 20px;">
      <div class="logs-toolbar-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <!-- Search Field -->
        <div class="logs-search-wrapper" style="flex: 1; min-width: 250px;">
          <div class="input-icon-wrapper">
            <span class="input-icon">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              class="form-input"
              placeholder="Cari IP penyerang, URI, Rule ID, atau tipe serangan..."
              style="padding: 8px 12px 8px 36px; font-size: 13px; width: 100%;"
              @keyup.enter="fetchLogs(false)"
            />
          </div>
        </div>

        <!-- Filter Action -->
        <div class="logs-actions-group" style="display: flex; align-items: center; gap: 12px;">
          <span class="logs-count-badge" style="font-size: 13px; color: var(--text-secondary);">
            Menampilkan: <strong>{{ logData.logs?.length || 0 }}</strong> event
          </span>
          <button class="btn btn-primary btn-sm" @click="fetchLogs(false)">
            Cari
          </button>
        </div>
      </div>
    </div>

    <!-- Table Audit Log Events -->
    <div class="table-container">
      <div v-if="loading" class="empty-state" style="padding: 40px;">
        <div class="spinner" style="margin: 0 auto 16px; width: 32px; height: 32px;"></div>
        <p>Membaca audit log ModSecurity...</p>
      </div>

      <div v-else-if="!logData.logs || logData.logs.length === 0" class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">🛡️</div>
        <h3>Tidak Ada Event Serangan Ditemukan</h3>
        <p>Server dalam kondisi aman atau belum ada request mencurigakan yang tercatat.</p>
      </div>

      <div v-else class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 150px;">Waktu</th>
              <th style="width: 140px;">IP Penyerang</th>
              <th style="width: 160px;">Target Host</th>
              <th style="width: 220px;">Endpoint / Method</th>
              <th>Rule Serangan Terdeteksi</th>
              <th style="width: 130px; text-align: center;">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logData.logs" :key="log.id">
              <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
                {{ log.timestamp || '-' }}
              </td>
              <td>
                <span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #38bdf8;">
                  {{ log.client_ip || '-' }}
                </span>
              </td>
              <td>
                <span style="font-weight: 500; color: var(--text-primary);">
                  {{ log.domain || '-' }}
                </span>
              </td>
              <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span class="badge" style="background: rgba(148, 163, 184, 0.15); margin-right: 6px; font-size: 11px;">
                  {{ log.method || 'GET' }}
                </span>
                <span style="font-family: monospace; font-size: 12px; color: var(--text-secondary);" :title="log.uri">
                  {{ log.uri || '/' }}
                </span>
              </td>
              <td style="max-width: 320px;">
                <div style="font-size: 13px; font-weight: 600; color: #f87171; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="log.rule_message">
                  {{ log.rule_message || 'Suspicious Traffic Detected' }}
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  Rule ID: <span style="font-family: monospace; color: var(--text-secondary);">{{ log.rule_id || '-' }}</span> 
                  &nbsp;|&nbsp; Severity: <span style="font-weight: 600;">{{ log.severity }}</span>
                </div>
              </td>
              <td style="text-align: center;">
                <span 
                  v-if="log.status_code === 403" 
                  class="badge" 
                  style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);"
                >
                  🛑 Blocked (403)
                </span>
                <span 
                  v-else 
                  class="badge" 
                  style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);"
                >
                  ⚠️ Logged ({{ log.status_code || 'Audit' }})
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../services/api.js'

const loading = ref(false)
const autoRefresh = ref(false)
let pollTimer = null

const searchQuery = ref('')
const stats = ref({
  total_attacks: 0,
  top_ips: [],
  top_rules: [],
  top_domains: []
})
const logData = ref({
  available: true,
  logs: []
})

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    pollTimer = setInterval(() => {
      fetchData(true)
    }, 5000)
    window.__toast?.('Live monitoring WAF aktif (tiap 5 detik)', 'info')
  } else {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }
}

async function fetchStats() {
  try {
    const res = await api.getWafStats()
    if (res.data?.success) {
      stats.value = res.data.data
    }
  } catch (err) {
    console.error('Error fetching WAF stats:', err)
  }
}

async function fetchLogs(silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await api.getWafLogs({
      search: searchQuery.value || undefined,
      limit: 100
    })
    if (res.data?.success) {
      logData.value = res.data.data
    }
  } catch (err) {
    console.error('Error fetching WAF logs:', err)
    if (!silent) window.__toast?.('Gagal memuat log WAF', 'error')
  } finally {
    if (!silent) loading.value = false
  }
}

async function fetchData(silent = false) {
  await Promise.all([fetchStats(), fetchLogs(silent)])
}

onMounted(() => {
  fetchData()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>
