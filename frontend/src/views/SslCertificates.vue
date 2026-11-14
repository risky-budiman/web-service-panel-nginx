<template>
  <div class="page-content">
    <div class="section-header">
      <div>
        <h3>Sertifikat SSL / TLS</h3>
        <p class="section-desc">Kelola enkripsi HTTPS dan sertifikat SSL untuk domain Anda</p>
      </div>
    </div>

    <!-- Alert Info -->
    <div class="card" style="margin-bottom: 24px; border-left: 4px solid var(--accent-primary); background: rgba(99, 102, 241, 0.05); padding: 18px 22px;">
      <div style="display: flex; gap: 14px; align-items: flex-start;">
        <Info :size="22" style="flex-shrink: 0; color: var(--accent-primary-hover);" aria-hidden="true" />
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
        <div class="empty-state-icon"><Lock :size="44" :stroke-width="1.5" /></div>
        <h3>Belum Ada Domain</h3>
        <p>Silakan buat proxy domain terlebih dahulu di menu Dashboard.</p>
      </div>

      <div v-else class="table-wrapper">
        <table class="data-table">
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
              <span
                v-if="cert.status === 'Expired'"
                class="badge badge-error"
                title="Sertifikat sudah kedaluwarsa. Klik Renew untuk memperbarui."
              >
                <CircleX :size="13" aria-hidden="true" /> Kedaluwarsa
              </span>
              <span 
                v-else-if="cert.ssl_enabled && cert.has_cert" 
                class="badge badge-active"
              >
                <span class="badge-dot badge-dot-active"></span>
                HTTPS Aktif
              </span>
              <span 
                v-else-if="cert.ssl_enabled && !cert.has_cert" 
                class="badge" 
                style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);"
                title="SSL aktif di panel namun file sertifikat belum ditemukan di VPS"
              >
                <TriangleAlert :size="13" aria-hidden="true" /> Missing Cert
              </span>
              <span 
                v-else-if="!cert.ssl_enabled && cert.has_cert" 
                class="badge" 
                style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);"
                title="Sertifikat sudah tersedia di disk, siap diaktifkan"
              >
                Siap (Cert Ready)
              </span>
              <span 
                v-else 
                class="badge badge-inactive"
              >
                HTTP Saja
              </span>
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">
              <template v-if="cert.expires_at">
                {{ formatDate(cert.expires_at) }}
                <div :class="expiryClass(cert.expires_at)" style="font-size: 12px;">
                  {{ expiryLabel(cert.expires_at) }}
                </div>
              </template>
              <template v-else>-</template>
            </td>
            <td>
              <span v-if="cert.ssl_enabled && cert.has_cert" style="color: var(--accent-success); font-size: 13px; font-weight: 500;">
                <CircleCheck :size="14" aria-hidden="true" style="vertical-align: -2px;" /> Aktif
              </span>
              <span v-else style="color: var(--text-muted); font-size: 13px;">
                -
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                <label class="toggle" :title="cert.ssl_enabled ? 'Nonaktifkan HTTPS' : 'Aktifkan HTTPS'">
                  <input 
                    type="checkbox" 
                    :checked="cert.ssl_enabled" 
                    :disabled="actionLoading === cert.id"
                    @change="toggleSslStatus(cert)" 
                  />
                  <span class="toggle-slider"></span>
                </label>
                <button
                  class="btn btn-secondary btn-sm"
                  :disabled="actionLoading === cert.id"
                  @click="enableSsl(cert)"
                  :title="cert.ssl_enabled ? 'Terbitkan ulang / Perbarui sertifikat Let\'s Encrypt' : 'Terbitkan sertifikat baru'"
                >
                  {{ actionLoading === cert.id ? 'Memproses...' : (cert.ssl_enabled ? 'Renew' : 'Request SSL') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Lock, CircleX, TriangleAlert, CircleCheck, Info } from 'lucide-vue-next'
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

async function toggleSslStatus(cert) {
  actionLoading.value = cert.id
  try {
    const res = await api.toggleSsl(cert.id)
    window.__toast?.(res.data.message, 'success')
    fetchData()
  } catch (err) {
    window.__toast?.(err.response?.data?.message || 'Gagal mengubah status SSL', 'error')
  } finally {
    actionLoading.value = null
  }
}

function daysLeft(dateStr) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function expiryLabel(dateStr) {
  const days = daysLeft(dateStr)
  if (days < 0) return `kedaluwarsa ${-days} hari lalu`
  if (days === 0) return 'kedaluwarsa hari ini'
  return `${days} hari lagi`
}

function expiryClass(dateStr) {
  const days = daysLeft(dateStr)
  if (days < 7) return 'cert-expiry-danger'
  if (days < 21) return 'cert-expiry-warn'
  return ''
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>
