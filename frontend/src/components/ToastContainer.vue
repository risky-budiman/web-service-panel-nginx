<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', toast.type]"
      >
        <span class="toast-icon">
          <CircleCheck v-if="toast.type === 'success'" :size="18" />
          <CircleX v-else-if="toast.type === 'error'" :size="18" />
          <TriangleAlert v-else-if="toast.type === 'warning'" :size="18" />
          <Info v-else :size="18" />
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" aria-label="Tutup notifikasi" @click="removeToast(toast.id)"><X :size="15" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { CircleCheck, CircleX, TriangleAlert, Info, X } from 'lucide-vue-next'
import { ref } from 'vue'

const toasts = ref([])
let toastId = 0

function addToast(message, type = 'info', duration = 4000) {
  const id = ++toastId
  toasts.value.push({ id, message, type })

  setTimeout(() => removeToast(id), duration)
}

function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

// Expose globally
defineExpose({ addToast })

// Make available globally via event bus
window.__toast = addToast
window.__clearToasts = () => { toasts.value = [] }
</script>

<style scoped>
.toast-enter-active {
  animation: slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  animation: slideInRight 200ms ease reverse;
}
</style>
