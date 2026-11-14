<template>
  <Teleport to="body">
    <Transition name="modal" appear @after-leave="$emit('closed')">
      <div v-if="open" class="bm-overlay" @mousedown.self="onBackdrop">
        <div
          ref="panel"
          class="bm-panel"
          :class="[`bm-${size}`]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="subtitle ? subtitleId : undefined"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <header class="bm-header">
            <div v-if="icon" class="bm-icon" :class="`bm-tone-${tone}`" aria-hidden="true">
              <component :is="icon" :size="20" :stroke-width="2" />
            </div>
            <div class="bm-titles">
              <h2 :id="titleId" class="bm-title">{{ title }}</h2>
              <p v-if="subtitle" :id="subtitleId" class="bm-subtitle">{{ subtitle }}</p>
            </div>
            <button
              type="button"
              class="bm-close"
              :disabled="busy"
              aria-label="Tutup"
              @click="requestClose"
            >
              <X :size="18" :stroke-width="2" />
            </button>
          </header>

          <div class="bm-body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="bm-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  tone: { type: String, default: 'primary' }, // primary | danger | warning | success | info
  size: { type: String, default: 'md' },      // sm | md | lg
  busy: { type: Boolean, default: false },    // saat proses berjalan modal tidak bisa ditutup
  closeOnBackdrop: { type: Boolean, default: true }
})
const emit = defineEmits(['close', 'closed'])

const uid = Math.random().toString(36).slice(2, 9)
const titleId = `bm-title-${uid}`
const subtitleId = `bm-sub-${uid}`
const panel = ref(null)
let previouslyFocused = null

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables() {
  return panel.value ? [...panel.value.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null) : []
}

function requestClose() {
  if (!props.busy) emit('close')
}

function onBackdrop() {
  if (props.closeOnBackdrop) requestClose()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    requestClose()
    return
  }
  // Kunci fokus Tab di dalam modal
  if (e.key === 'Tab') {
    const items = focusables()
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

// Kunci scroll halaman di belakang modal (mendukung modal bertumpuk)
function lockScroll() {
  const count = Number(document.body.dataset.modalCount || 0) + 1
  document.body.dataset.modalCount = String(count)
  if (count === 1) {
    document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`
    document.body.style.overflow = 'hidden'
  }
}

function unlockScroll() {
  const count = Math.max(0, Number(document.body.dataset.modalCount || 0) - 1)
  document.body.dataset.modalCount = String(count)
  if (count === 0) {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}

let locked = false
watch(() => props.open, async (isOpen) => {
  if (isOpen && !locked) {
    locked = true
    previouslyFocused = document.activeElement
    lockScroll()
    await nextTick()
    const target = panel.value?.querySelector('[autofocus]') ||
      panel.value?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ||
      panel.value?.querySelector('.bm-footer button:not([disabled])') ||
      panel.value
    target?.focus({ preventScroll: true })
  } else if (!isOpen && locked) {
    locked = false
    unlockScroll()
    previouslyFocused?.focus?.({ preventScroll: true })
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (locked) {
    locked = false
    unlockScroll()
    previouslyFocused?.focus?.({ preventScroll: true })
  }
})
</script>

<style scoped>
.bm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: rgba(3, 6, 15, 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.bm-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: min(860px, calc(100dvh - 48px));
  background: #141a29;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(0, 0, 0, 0.4);
  outline: none;
  overflow: hidden;
}

.bm-sm { max-width: 420px; }
.bm-md { max-width: 560px; }
.bm-lg { max-width: 720px; }

.bm-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 20px 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.bm-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.bm-tone-primary { background: rgba(99, 102, 241, 0.14); color: #a5b4fc; }
.bm-tone-danger  { background: rgba(239, 68, 68, 0.14);  color: #fca5a5; }
.bm-tone-warning { background: rgba(245, 158, 11, 0.14); color: #fcd34d; }
.bm-tone-success { background: rgba(16, 185, 129, 0.14); color: #6ee7b7; }
.bm-tone-info    { background: rgba(59, 130, 246, 0.14); color: #93c5fd; }

.bm-titles {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
}

.bm-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: #f1f5f9;
}

.bm-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #94a3b8;
}

.bm-close {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: -2px -4px 0 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

.bm-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
}

.bm-close:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

.bm-close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 24px 24px;
}

.bm-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
}

/* Animasi */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}
.modal-enter-active .bm-panel,
.modal-leave-active .bm-panel {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .bm-panel,
.modal-leave-to .bm-panel {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

/* Mobile: bottom sheet */
@media (max-width: 640px) {
  .bm-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .bm-panel,
  .bm-sm,
  .bm-md,
  .bm-lg {
    max-width: 100%;
    max-height: calc(100dvh - 24px);
    border-radius: 18px 18px 0 0;
    border-bottom: 0;
  }

  .bm-header {
    padding: 18px 16px 14px 18px;
  }

  .bm-body {
    padding: 18px;
  }

  .bm-footer {
    padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  }

  .bm-footer :deep(.btn) {
    flex: 1;
    justify-content: center;
  }

  .modal-enter-from .bm-panel,
  .modal-leave-to .bm-panel {
    transform: translateY(100%);
  }
}
</style>
