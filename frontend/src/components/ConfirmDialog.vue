<template>
  <BaseModal
    :title="title"
    :icon="resolvedIcon"
    :tone="resolvedTone"
    size="sm"
    :busy="loading"
    @close="$emit('cancel')"
  >
    <p class="cd-message">{{ message }}</p>
    <slot />

    <template #footer>
      <button type="button" class="btn btn-secondary" :disabled="loading" :autofocus="resolvedTone === 'danger'" @click="$emit('cancel')">
        {{ cancelText }}
      </button>
      <button
        type="button"
        :class="['btn', resolvedTone === 'danger' ? 'btn-danger' : 'btn-primary']"
        :disabled="loading"
        :autofocus="resolvedTone !== 'danger'"
        @click="$emit('confirm')"
      >
        <LoaderCircle v-if="loading" :size="16" class="cd-spin" aria-hidden="true" />
        {{ confirmText }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue'
import { TriangleAlert, LoaderCircle } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'

const props = defineProps({
  title: { type: String, default: 'Konfirmasi' },
  message: { type: String, default: 'Apakah Anda yakin?' },
  icon: { type: [Object, Function], default: null },
  tone: { type: String, default: '' },          // danger | warning | primary | info | success
  confirmText: { type: String, default: 'Ya, Lanjutkan' },
  cancelText: { type: String, default: 'Batal' },
  dangerMode: { type: Boolean, default: false }, // kompatibilitas lama → tone danger
  loading: { type: Boolean, default: false }
})

defineEmits(['confirm', 'cancel'])

const resolvedTone = computed(() => props.tone || (props.dangerMode ? 'danger' : 'warning'))
const resolvedIcon = computed(() => props.icon || TriangleAlert)
</script>

<style scoped>
.cd-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: #cbd5e1;
}

.cd-spin {
  animation: cd-rotate 0.9s linear infinite;
}

@keyframes cd-rotate {
  to { transform: rotate(360deg); }
}
</style>
