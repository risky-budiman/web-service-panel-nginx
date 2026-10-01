<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editMode ? '✏️ Edit Proxy' : '➕ Tambah Proxy Baru' }}</h2>
          <button class="modal-close" @click="$emit('close')">✕</button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="domain_name">
                <span>Domain Host</span>
                <span class="optional">FQDN</span>
              </label>
              <div class="input-icon-wrapper">
                <span class="input-icon">🌐</span>
                <input
                  id="domain_name"
                  v-model="form.domain_name"
                  type="text"
                  class="form-input"
                  placeholder="misal: api.domainanda.com"
                  required
                />
              </div>
              <p class="form-hint">💡 Domain yang akan di-forward oleh Nginx ke service internal</p>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="target_ip">
                  <span>Target IP / Host</span>
                </label>
                <div class="input-icon-wrapper">
                  <span class="input-icon">🎯</span>
                  <input
                    id="target_ip"
                    v-model="form.target_ip"
                    type="text"
                    class="form-input"
                    placeholder="192.168.1.100 atau 127.0.0.1"
                    required
                  />
                </div>
                <p class="form-hint">IP private server tujuan</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="target_port">
                  <span>Port Tujuan</span>
                </label>
                <div class="input-icon-wrapper">
                  <span class="input-icon">🔌</span>
                  <input
                    id="target_port"
                    v-model.number="form.target_port"
                    type="number"
                    class="form-input"
                    placeholder="8080"
                    min="1"
                    max="65535"
                    required
                  />
                </div>
                <p class="form-hint">Port service (1-65535)</p>
              </div>
            </div>

            <div class="form-group">
              <div class="toggle-wrapper">
                <label class="toggle">
                  <input type="checkbox" v-model="form.ssl_enabled" />
                  <span class="toggle-slider"></span>
                </label>
                <div>
                  <span style="font-size: 14px; font-weight: 600; color: #f8fafc;">🔒 Enkripsi SSL / HTTPS</span>
                  <p class="form-hint" style="margin-top: 2px;">Aktifkan konfigurasi blok HTTPS port 443 otomatis</p>
                </div>
              </div>
            </div>

            <!-- ModSecurity WAF Option as Segmented Toggle -->
            <div class="form-group">
              <label class="form-label">
                <span>🛡️ Proteksi WAF (ModSecurity)</span>
              </label>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 4px;">
                <button
                  type="button"
                  :class="['btn btn-sm', form.waf_mode === 'off' ? 'btn-primary' : 'btn-secondary']"
                  style="padding: 10px; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; align-items: center; gap: 4px;"
                  @click="form.waf_mode = 'off'"
                >
                  <span>⚪ Off</span>
                  <span style="font-size: 10px; opacity: 0.8; font-weight: normal;">Tanpa WAF</span>
                </button>
                <button
                  type="button"
                  :class="['btn btn-sm', form.waf_mode === 'detection' ? 'btn-primary' : 'btn-secondary']"
                  style="padding: 10px; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; align-items: center; gap: 4px;"
                  @click="form.waf_mode = 'detection'"
                >
                  <span>⚠️ Detection</span>
                  <span style="font-size: 10px; opacity: 0.8; font-weight: normal;">Log Ancaman</span>
                </button>
                <button
                  type="button"
                  :class="['btn btn-sm', form.waf_mode === 'on' ? 'btn-primary' : 'btn-secondary']"
                  style="padding: 10px; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; align-items: center; gap: 4px;"
                  @click="form.waf_mode = 'on'"
                >
                  <span>🛡️ Enforce</span>
                  <span style="font-size: 10px; opacity: 0.8; font-weight: normal;">Blokir 403</span>
                </button>
              </div>
              <p class="form-hint" style="margin-top: 6px;">
                {{ form.waf_mode === 'on' ? 'Aktif memblokir SQL Injection, XSS, Path Traversal, Bot jahat (HTTP 403).' : (form.waf_mode === 'detection' ? 'Memonitor & mencatat seluruh serangan tanpa memutus koneksi.' : 'Tidak ada inspeksi paket ModSecurity pada domain ini.') }}
              </p>
            </div>

            <div v-if="errors.length > 0" style="margin-top: 8px;">
              <p v-for="err in errors" :key="err" class="form-error">⚠️ {{ err }}</p>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">Batal</button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              <span v-if="submitting" class="spinner"></span>
              {{ editMode ? 'Simpan Perubahan' : 'Tambah Proxy' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import api from '../services/api.js'

const props = defineProps({
  proxy: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved'])

const editMode = !!props.proxy
const submitting = ref(false)
const errors = ref([])

const form = reactive({
  domain_name: props.proxy?.domain_name || '',
  target_ip: props.proxy?.target_ip || '',
  target_port: props.proxy?.target_port || 80,
  ssl_enabled: props.proxy?.ssl_enabled ? true : false,
  waf_mode: props.proxy?.waf_mode || 'off'
})

async function handleSubmit() {
  errors.value = []
  submitting.value = true

  try {
    if (editMode) {
      await api.updateProxy(props.proxy.id, form)
      window.__toast?.('Proxy berhasil diperbarui', 'success')
    } else {
      await api.createProxy(form)
      window.__toast?.('Proxy berhasil ditambahkan', 'success')
    }
    emit('saved')
    emit('close')
  } catch (err) {
    const data = err.response?.data
    if (data?.errors) {
      errors.value = data.errors
    } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      // Jika request timeout karena Certbot berjalan lama di server
      window.__toast?.('Permintaan sedang diproses di server', 'info')
      emit('saved')
      emit('close')
    } else {
      errors.value = [data?.message || err.message || 'Terjadi kesalahan']
    }
  } finally {
    submitting.value = false
  }
}
</script>
