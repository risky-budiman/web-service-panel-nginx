<template>
  <BaseModal
    :title="editMode ? 'Edit Proxy Host' : 'Tambah Proxy Host'"
    :subtitle="editMode ? props.proxy.domain_name : 'Arahkan domain publik ke layanan di jaringan internal.'"
    :icon="editMode ? Pencil : Globe"
    size="md"
    :busy="submitting"
    @close="$emit('close')"
  >
    <form id="proxy-form" novalidate @submit.prevent="handleSubmit">
      <!-- Server error -->
      <div v-if="serverErrors.length" class="pf-alert" role="alert">
        <CircleAlert :size="18" class="pf-alert-icon" aria-hidden="true" />
        <div>
          <p class="pf-alert-title">{{ serverErrors[0] }}</p>
          <ul v-if="serverErrors.length > 1" class="pf-alert-list">
            <li v-for="(err, i) in serverErrors.slice(1)" :key="i"><code>{{ err }}</code></li>
          </ul>
        </div>
      </div>

      <!-- Domain -->
      <section class="pf-section">
        <div class="pf-field">
          <label class="pf-label" for="domain_name">Domain</label>
          <div class="pf-input" :class="{ invalid: fieldErrors.domain_name }">
            <Globe :size="16" class="pf-input-icon" aria-hidden="true" />
            <input
              id="domain_name"
              v-model.trim="form.domain_name"
              type="text"
              class="form-input"
              placeholder="app.domainanda.com"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :aria-invalid="Boolean(fieldErrors.domain_name)"
              aria-describedby="domain_hint"
              @blur="validateField('domain_name')"
            />
          </div>
          <p v-if="fieldErrors.domain_name" class="pf-error">{{ fieldErrors.domain_name }}</p>
          <p v-else id="domain_hint" class="pf-hint">
            Alias <code>{{ aliasHint }}</code> ditambahkan otomatis.
          </p>
        </div>
      </section>

      <!-- Upstream -->
      <section class="pf-section">
        <h3 class="pf-section-title">Tujuan (upstream)</h3>
        <div class="pf-row">
          <div class="pf-field pf-grow">
            <label class="pf-label" for="target_ip">IP server internal</label>
            <div class="pf-input" :class="{ invalid: fieldErrors.target_ip }">
              <Server :size="16" class="pf-input-icon" aria-hidden="true" />
              <input
                id="target_ip"
                v-model.trim="form.target_ip"
                type="text"
                inputmode="decimal"
                class="form-input pf-mono"
                placeholder="192.168.1.100"
                autocomplete="off"
                spellcheck="false"
                :aria-invalid="Boolean(fieldErrors.target_ip)"
                @blur="validateField('target_ip')"
              />
            </div>
            <p v-if="fieldErrors.target_ip" class="pf-error">{{ fieldErrors.target_ip }}</p>
          </div>

          <div class="pf-field pf-port">
            <label class="pf-label" for="target_port">Port</label>
            <div class="pf-input" :class="{ invalid: fieldErrors.target_port }">
              <input
                id="target_port"
                v-model="form.target_port"
                type="text"
                inputmode="numeric"
                maxlength="5"
                class="form-input pf-mono pf-no-icon"
                placeholder="8080"
                :aria-invalid="Boolean(fieldErrors.target_port)"
                @blur="validateField('target_port')"
              />
            </div>
            <p v-if="fieldErrors.target_port" class="pf-error">{{ fieldErrors.target_port }}</p>
          </div>
        </div>

        <div class="pf-preview" aria-live="polite">
          <span class="pf-preview-from">{{ previewFrom }}</span>
          <ArrowRight :size="14" aria-hidden="true" />
          <span class="pf-preview-to">{{ previewTo }}</span>
        </div>
      </section>

      <!-- Security -->
      <section class="pf-section">
        <h3 class="pf-section-title">Keamanan</h3>

        <label class="pf-switch-row" for="ssl_enabled">
          <span class="pf-switch-icon" :class="{ on: form.ssl_enabled }" aria-hidden="true">
            <Lock v-if="form.ssl_enabled" :size="16" />
            <LockOpen v-else :size="16" />
          </span>
          <span class="pf-switch-text">
            <span class="pf-switch-title">HTTPS (Let's Encrypt)</span>
            <span class="pf-switch-desc">
              {{ form.ssl_enabled
                ? 'Sertifikat diterbitkan otomatis. Pastikan DNS domain sudah mengarah ke server ini.'
                : 'Domain dilayani lewat HTTP biasa tanpa enkripsi.' }}
            </span>
          </span>
          <span class="toggle">
            <input id="ssl_enabled" v-model="form.ssl_enabled" type="checkbox" role="switch" />
            <span class="toggle-slider"></span>
          </span>
        </label>

        <div class="pf-field" style="margin-top: 16px;">
          <span id="waf_label" class="pf-label">Web Application Firewall</span>
          <div class="pf-segmented" role="radiogroup" aria-labelledby="waf_label">
            <label
              v-for="opt in WAF_OPTIONS"
              :key="opt.value"
              class="pf-seg"
              :class="[`pf-seg-${opt.value}`, { active: form.waf_mode === opt.value }]"
            >
              <input v-model="form.waf_mode" type="radio" name="waf_mode" :value="opt.value" class="pf-sr-only" />
              <component :is="opt.icon" :size="16" aria-hidden="true" />
              <span class="pf-seg-label">{{ opt.label }}</span>
            </label>
          </div>
          <p class="pf-hint">{{ activeWaf.description }}</p>
        </div>
      </section>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" :disabled="submitting" @click="$emit('close')">Batal</button>
      <button type="submit" form="proxy-form" class="btn btn-primary" :disabled="submitting">
        <LoaderCircle v-if="submitting" :size="16" class="pf-spin" aria-hidden="true" />
        {{ submitting ? (form.ssl_enabled ? 'Menerbitkan SSL…' : 'Menyimpan…') : (editMode ? 'Simpan Perubahan' : 'Tambah Proxy') }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import {
  Globe, Pencil, Server, Lock, LockOpen, ArrowRight, CircleAlert, LoaderCircle,
  ShieldOff, ShieldAlert, ShieldCheck
} from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import api from '../services/api.js'

const props = defineProps({
  proxy: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const WAF_OPTIONS = [
  { value: 'off', label: 'Off', icon: ShieldOff, description: 'Tidak ada inspeksi ModSecurity pada domain ini.' },
  { value: 'detection', label: 'Detection', icon: ShieldAlert, description: 'Serangan dicatat di WAF Monitoring tanpa diblokir. Cocok untuk uji coba awal.' },
  { value: 'on', label: 'Enforce', icon: ShieldCheck, description: 'Request berbahaya (SQLi, XSS, path traversal, scanner) diblokir dengan HTTP 403.' }
]

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

const editMode = !!props.proxy
const submitting = ref(false)
const serverErrors = ref([])
const fieldErrors = reactive({ domain_name: '', target_ip: '', target_port: '' })

const form = reactive({
  domain_name: props.proxy?.domain_name || '',
  target_ip: props.proxy?.target_ip || '',
  target_port: String(props.proxy?.target_port || ''),
  ssl_enabled: Boolean(props.proxy?.ssl_enabled),
  waf_mode: props.proxy?.waf_mode || 'off'
})

const activeWaf = computed(() => WAF_OPTIONS.find(o => o.value === form.waf_mode) || WAF_OPTIONS[0])

const aliasHint = computed(() => {
  const d = form.domain_name.toLowerCase() || 'domain.com'
  return d.startsWith('www.') ? d.slice(4) : `www.${d}`
})
const previewFrom = computed(() => `${form.ssl_enabled ? 'https' : 'http'}://${form.domain_name.toLowerCase() || 'domain'}`)
const previewTo = computed(() => `http://${form.target_ip || '0.0.0.0'}:${form.target_port || '—'}`)

function isPrivateIPv4(ip) {
  if (ip === 'localhost') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return false
  const p = m.slice(1).map(Number)
  if (p.some(n => n > 255) || m.slice(1).some(s => s.length > 1 && s.startsWith('0'))) return false
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
}

const VALIDATORS = {
  domain_name: (v) => {
    if (!v) return 'Domain wajib diisi'
    if (!DOMAIN_RE.test(v.toLowerCase())) return 'Format domain tidak valid, contoh: app.domainanda.com'
    return ''
  },
  target_ip: (v) => {
    if (!v) return 'IP tujuan wajib diisi'
    if (!isPrivateIPv4(v)) return 'Gunakan IPv4 privat: 10.x, 172.16–31.x, 192.168.x, atau 127.x'
    return ''
  },
  target_port: (v) => {
    if (!v) return 'Wajib'
    if (!/^\d{1,5}$/.test(v) || Number(v) < 1 || Number(v) > 65535) return '1–65535'
    return ''
  }
}

function validateField(name) {
  fieldErrors[name] = VALIDATORS[name](String(form[name] ?? '').trim())
  return !fieldErrors[name]
}

async function handleSubmit() {
  serverErrors.value = []
  const valid = Object.keys(VALIDATORS).map(validateField).every(Boolean)
  if (!valid) {
    const first = Object.keys(VALIDATORS).find(k => fieldErrors[k])
    document.getElementById(first)?.focus()
    return
  }

  submitting.value = true
  const payload = { ...form, domain_name: form.domain_name.toLowerCase(), target_port: Number(form.target_port) }

  try {
    if (editMode) {
      await api.updateProxy(props.proxy.id, payload)
      window.__toast?.('Proxy berhasil diperbarui', 'success')
    } else {
      await api.createProxy(payload)
      window.__toast?.('Proxy berhasil ditambahkan', 'success')
    }
    emit('saved')
    emit('close')
  } catch (err) {
    const data = err.response?.data
    if (err.code === 'ECONNABORTED') {
      // Certbot bisa berjalan lama; server tetap memprosesnya
      window.__toast?.('Server masih memproses permintaan. Muat ulang daftar beberapa saat lagi.', 'info')
      emit('saved')
      emit('close')
    } else if (!err.response) {
      serverErrors.value = ['Tidak dapat terhubung ke server panel']
    } else if (data?.errors?.length) {
      serverErrors.value = ['Periksa kembali isian berikut:', ...data.errors]
    } else {
      serverErrors.value = [data?.message || 'Terjadi kesalahan']
      // Baris penting dari output nginx -t bila konfigurasi ditolak
      const detail = (data?.nginx_output || '').split('\n').filter(l => /emerg|error|failed/i.test(l)).slice(0, 3)
      serverErrors.value.push(...detail)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.pf-section + .pf-section {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pf-section-title {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}

.pf-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.pf-grow { flex: 1; min-width: 0; }
.pf-port { width: 116px; flex-shrink: 0; }

.pf-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 550;
  color: #cbd5e1;
}

.pf-input {
  position: relative;
}

.pf-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
  transition: color 150ms ease;
}

.pf-input:focus-within .pf-input-icon {
  color: #a5b4fc;
}

.pf-input .form-input {
  padding: 10px 12px 10px 38px;
  box-shadow: none;
}

.pf-input .pf-no-icon {
  padding-left: 12px;
}

.pf-mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13.5px;
}

.pf-input .form-input:focus {
  transform: none;
}

.pf-input.invalid .form-input,
.pf-input.invalid .form-input:focus {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.05);
}

.pf-input.invalid .form-input:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
}

.pf-input.invalid .pf-input-icon {
  color: #f87171;
}

.pf-hint,
.pf-error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.pf-hint { color: #64748b; }
.pf-error { color: #f87171; }

.pf-hint code {
  font-size: 11.5px;
  color: #94a3b8;
}

.pf-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 20, 32, 0.6);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: #64748b;
  word-break: break-all;
}

.pf-preview-from { color: #a5b4fc; }
.pf-preview-to { color: #cbd5e1; }

.pf-switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: border-color 150ms ease;
}

.pf-switch-row:hover {
  border-color: rgba(255, 255, 255, 0.14);
}

.pf-switch-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.pf-switch-icon.on {
  background: rgba(16, 185, 129, 0.14);
  color: #34d399;
}

.pf-switch-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pf-switch-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.pf-switch-desc {
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.pf-segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(15, 20, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.pf-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 6px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

.pf-seg:hover { color: #e2e8f0; }

.pf-seg-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-seg.active { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); }
.pf-seg-off.active { background: rgba(148, 163, 184, 0.16); color: #e2e8f0; }
.pf-seg-detection.active { background: rgba(245, 158, 11, 0.16); color: #fbbf24; }
.pf-seg-on.active { background: rgba(16, 185, 129, 0.16); color: #34d399; }

.pf-seg:has(input:focus-visible) {
  outline: 2px solid #818cf8;
  outline-offset: 1px;
}

.pf-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
}

.pf-alert {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fecaca;
  font-size: 13px;
  line-height: 1.5;
}

.pf-alert-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: #f87171;
}

.pf-alert-title {
  margin: 0;
  font-weight: 600;
}

.pf-alert-list {
  margin: 6px 0 0;
  padding-left: 16px;
}

.pf-alert-list code {
  font-size: 12px;
  color: #fca5a5;
  white-space: pre-wrap;
  word-break: break-word;
}

.pf-spin {
  animation: pf-rotate 0.9s linear infinite;
}

@keyframes pf-rotate {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .pf-port { width: 96px; }
  .pf-seg { flex-direction: column; gap: 3px; font-size: 12px; }
}
</style>
