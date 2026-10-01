<template>
  <div class="page-content waf-monitoring-view">
    <!-- Header Section -->
    <div class="section-header waf-header-row">
      <div>
        <h2 class="waf-title">
          <span>🛡️</span> Web Application Firewall (WAF)
        </h2>
        <p class="section-desc">
          Monitoring real-time deteksi ancaman, audit log OWASP Core Rule Set (CRS), dan status proteksi ModSecurity
        </p>
      </div>
      
      <!-- Top Action Toolbar -->
      <div class="waf-top-actions">
        <button 
          :class="['btn btn-sm', autoRefresh ? 'btn-primary' : 'btn-secondary']"
          @click="toggleAutoRefresh"
          title="Polling otomatis setiap 5 detik"
        >
          <span :style="{ display: 'inline-block', transform: autoRefresh ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }">⚡</span>
          <span>{{ autoRefresh ? 'Live (5s)' : 'Auto Refresh Off' }}</span>
        </button>

        <button class="btn btn-secondary btn-sm" @click="fetchData(false)" :disabled="loading">
          <span>🔄</span> <span>{{ loading ? 'Memuat...' : 'Refresh' }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Status Log Server (Jika belum di Linux / log kosong) -->
    <div v-if="!logData.available" class="card waf-alert-card">
      <div class="waf-alert-content">
        <div style="font-size: 24px; line-height: 1;">💡</div>
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
    <div class="stats-grid waf-stats-grid" style="margin-bottom: 24px;">
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
    <div class="waf-summary-grid">
      <!-- Top Attacker IPs -->
      <div class="card waf-card">
        <h3 class="waf-card-title">
          <span style="display: flex; align-items: center; gap: 8px;"><span>🎯</span> Top 5 IP Penyerang</span>
          <span class="waf-card-sub">Hits</span>
        </h3>
        <div v-if="!stats.top_ips || stats.top_ips.length === 0" class="empty-state" style="padding: 24px 0;">
          <p style="font-size: 13px; color: var(--text-muted);">Belum ada IP ancaman tercatat</p>
        </div>
        <div v-else class="waf-list">
          <div 
            v-for="item in stats.top_ips" 
            :key="item.key" 
            class="waf-list-item"
          >
            <span class="waf-ip-code">{{ item.key }}</span>
            <span class="badge" style="background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">
              {{ item.count }} hits
            </span>
          </div>
        </div>
      </div>

      <!-- Top Triggered Rules -->
      <div class="card waf-card">
        <h3 class="waf-card-title">
          <span style="display: flex; align-items: center; gap: 8px;"><span>📋</span> Kategori Ancaman Teratas</span>
          <span class="waf-card-sub">Aturan</span>
        </h3>
        <div v-if="!stats.top_rules || stats.top_rules.length === 0" class="empty-state" style="padding: 24px 0;">
          <p style="font-size: 13px; color: var(--text-muted);">Belum ada rule yang ter-trigger</p>
        </div>
        <div v-else class="waf-list">
          <div 
            v-for="item in stats.top_rules" 
            :key="item.key" 
            class="waf-list-item"
          >
            <span class="waf-rule-name" :title="item.key">
              {{ item.key }}
            </span>
            <span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); flex-shrink: 0;">
              {{ item.count }}x
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter & Action Toolbar -->
    <div class="card access-logs-toolbar waf-toolbar" style="margin-bottom: 20px;">
      <div class="logs-toolbar-row waf-toolbar-row">
        <!-- Search Field -->
        <div class="logs-search-wrapper" style="flex: 1; min-width: 220px;">
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
        <div class="waf-toolbar-actions">
          <span class="logs-count-badge">
            Menampilkan: <strong>{{ logData.logs?.length || 0 }}</strong> event
          </span>
          <button class="btn btn-primary btn-sm" @click="fetchLogs(false)">
            Cari
          </button>
        </div>
      </div>
    </div>

    <!-- Table Audit Log Events (Fully Responsive with horizontal scroll) -->
    <div class="table-container">
      <div v-if="loading" class="empty-state" style="padding: 40px;">
        <div class="spinner" style="margin: 0 auto 16px; width: 32px; height: 32px;"></div>
        <p>Membaca audit log ModSecurity...</p>
      </div>

      <div v-else-if="!logData.logs || logData.logs.length === 0" class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">🛡️</div>
        <h3>Tidak Ada Event Serangan Ditemukan</h3>
        <p>Server dalam kondisi aman atau belum ada request mencurigakan yang cocok.</p>
      </div>

      <div v-else class="table-wrapper">
        <table class="data-table waf-table">
          <thead>
            <tr>
              <th style="min-width: 140px;">Waktu</th>
              <th style="min-width: 130px;">IP Penyerang</th>
              <th style="min-width: 140px;">Target Host</th>
              <th style="min-width: 200px;">Endpoint / Method</th>
              <th style="min-width: 260px;">Rule Serangan Terdeteksi</th>
              <th style="min-width: 110px; text-align: center;">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logData.logs" :key="log.id">
              <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
                {{ log.timestamp || '-' }}
              </td>
              <td>
                <span class="waf-ip-code">
                  {{ log.client_ip || '-' }}
                </span>
              </td>
              <td>
                <span style="font-weight: 500; color: var(--text-primary); font-size: 13px;">
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
                  &nbsp;|&nbsp; Sev: <span style="font-weight: 600;">{{ log.severity }}</span>
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

<style scoped>
.waf-monitoring-view {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

.waf-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  width: 100%;
}

.waf-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.waf-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.waf-alert-card {
  margin-bottom: 20px;
  padding: 16px 20px;
  border-left: 4px solid var(--accent-warning);
  background: rgba(245, 158, 11, 0.05);
}

.waf-alert-content {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.waf-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  width: 100%;
}

.waf-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  width: 100%;
}

.waf-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}

.waf-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.waf-card-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.waf-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.waf-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  gap: 10px;
  min-width: 0;
}

.waf-ip-code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--accent-primary-hover);
  font-weight: 500;
  word-break: break-all;
}

.waf-rule-name {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.waf-toolbar {
  padding: 16px 20px;
}

.waf-toolbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  width: 100%;
}

.waf-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.waf-table {
  width: 100%;
  min-width: 750px;
}

/* ─── Responsive Breakpoints ────────────────────────────── */
@media (max-width: 1440px) {
  .waf-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1024px) {
  .waf-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .waf-header-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .waf-title {
    font-size: 18px;
  }

  .waf-top-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .waf-top-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .waf-stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .waf-summary-grid {
    grid-template-columns: 1fr;
    gap: 14px;
    margin-bottom: 16px;
  }

  .waf-toolbar {
    padding: 12px 14px;
  }

  .waf-toolbar-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .waf-toolbar-actions {
    justify-content: space-between;
    width: 100%;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
  }

  .waf-toolbar-actions .btn {
    flex: 1;
    justify-content: center;
    max-width: 120px;
  }
}

@media (max-width: 480px) {
  .waf-stats-grid {
    grid-template-columns: 1fr;
  }

  .waf-card {
    padding: 14px 12px;
  }

  .waf-list-item {
    padding: 6px 10px;
    font-size: 12px;
  }

  .waf-alert-card {
    padding: 12px 14px;
  }

  .waf-top-actions {
    flex-direction: row;
    gap: 8px;
  }
}
</style>
