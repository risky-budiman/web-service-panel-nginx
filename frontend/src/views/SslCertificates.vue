<template>
  <div class="page-content">
    <div class="section-header">
      <div>
        <h3>🔒 Sertifikat SSL / TLS</h3>
        <p class="section-desc">Kelola enkripsi HTTPS dan sertifikat SSL untuk domain Anda</p>
      </div>
    </div>

    <!-- Alert Info -->
    <div class="card" style="margin-bottom: 24px; border-left: 4px solid var(--accent-primary); background: rgba(99, 102, 241, 0.05); padding: 18px 22px;">
      <div style="display: flex; gap: 14px; align-items: flex-start;">
        <span style="font-size: 24px;">ℹ️</span>
        <div>
          <h4 style="margin-bottom: 4px; font-size: 15px; color: var(--text-primary);">Otomasi SSL & HTTPS</h4>
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
            Sertifikat SSL mengamankan lalu lintas dengan enkripsi TLS port 443. Di server VPS Linux produksi, Nginx Panel mengintegrasikan penerbitan dan pembaruan otomatis via Certbot (Let's Encrypt).
          </p>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="table-container">
      <div v-if="loading" class="empty-state">
        <p>Memuat status sertifikat SSL...</p>
      </div>

      <div v-else-if="certificates.length === 0" class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>Belum Ada Domain</h3>
        <p>Silakan buat proxy domain terlebih dahulu di menu Dashboard.</p>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Penerbit (Issuer)</th>
            <th>Status SSL</th>
            <th>Masa Berlaku</th>
            <th>Auto-Renew</th>
            <th style="text-align: right;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cert in certificates" :key="cert.id">
            <td>
              <strong style="color: var(--text-primary); font-family: monospace; font-size: 14px;">
                {{ cert.domain_name }}
              </strong>
            </td>
            <td>
              <span class="badge" :class="cert.ssl_enabled ? 'badge-primary' : 'badge-inactive'">
                {{ cert.issuer }}
              </span>
            </td>
            <td>
              <span class="badge" :class="cert.ssl_enabled ? 'badge-active' : 'badge-inactive'">
                <span class="badge-dot" :class="cert.ssl_enabled ? 'badge-dot-active' : ''"></span>
                {{ cert.ssl_enabled ? 'HTTPS Aktif' : 'HTTP Saja' }}
              </span>
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">
              {{ cert.expires_at ? formatDate(cert.expires_at) : '-' }}
            </td>
            <td>
              <span v-if="cert.ssl_enabled" style="color: var(--accent-success); font-size: 13px; font-weight: 500;">
                ✓ Aktif
              </span>
              <span v-else style="color: var(--text-muted); font-size: 13px;">
                -
              </span>
            </td>
            <td style="text-align: right;">
              <button
                v-if="!cert.ssl_enabled"
                class="btn btn-primary btn-sm"
                :disabled="actionLoading === cert.id"
                @click="enableSsl(cert)"
              >
                {{ actionLoading === cert.id ? 'Memproses...' : '🔐 Aktifkan SSL' }}
              </button>
              <button
                v-else
                class="btn btn-secondary btn-sm"
                :disabled="actionLoading === cert.id"
                @click="enableSsl(cert)"
              >
                {{ actionLoading === cert.id ? 'Memproses...' : '🔄 Perbarui SSL' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api.js'

const certificates = ref([])
const loading = ref(true)
const actionLoading = ref(null)

onMounted(() => {
  fetchData()
})

async function fetchData() {
  loading.value = true
  try {
    const res = await api.getSslCertificates()
    certificates.value = res.data.data
  } catch (err) {
    window.__toast?.('Gagal memuat sertifikat SSL', 'error')
  } finally {
    loading.value = false
  }
}

async function enableSsl(cert) {
  actionLoading.value = cert.id
  try {
    const res = await api.requestSsl(cert.id)
    window.__toast?.(res.data.message, 'success')
    fetchData()
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal mengaktifkan SSL', 'error')
  } finally {
    actionLoading.value = null
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>
