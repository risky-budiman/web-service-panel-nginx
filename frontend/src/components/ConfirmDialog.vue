<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-body">
          <div class="confirm-body">
            <div class="confirm-icon">{{ icon }}</div>
            <h3>{{ title }}</h3>
            <p>{{ message }}</p>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: center;">
          <button class="btn btn-secondary" @click="$emit('cancel')">Batal</button>
          <button :class="['btn', dangerMode ? 'btn-danger' : 'btn-primary']" @click="$emit('confirm')">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Konfirmasi' },
  message: { type: String, default: 'Apakah Anda yakin?' },
  icon: { type: String, default: '⚠️' },
  confirmText: { type: String, default: 'Ya, Lanjutkan' },
  dangerMode: { type: Boolean, default: false }
})

defineEmits(['confirm', 'cancel'])
</script>
