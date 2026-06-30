<script setup>
import { useToastStore } from '../stores/toast';

const toastStore = useToastStore();
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="t in toastStore.toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        role="status"
        @click="toastStore.remove(t.id)"
      >
        <span class="toast-icon">{{ t.type === 'error' ? '⚠' : t.type === 'success' ? '✓' : 'ℹ' }}</span>
        <span class="toast-message">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 360px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  background: #fff;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  box-shadow: 0 10px 28px rgba(20, 30, 45, 0.18);
  border-left: 4px solid var(--color-primary-light);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1.4;
  pointer-events: auto;
}

.toast.success { border-left-color: var(--color-debit); }
.toast.error { border-left-color: var(--color-credit); }
.toast.info { border-left-color: var(--color-primary-light); }

.toast-icon { font-weight: 700; flex-shrink: 0; }
.toast.success .toast-icon { color: var(--color-debit); }
.toast.error .toast-icon { color: var(--color-credit); }
.toast.info .toast-icon { color: var(--color-primary-light); }

.toast-message { flex: 1; word-break: break-word; }

.toast-enter-active, .toast-leave-active, .toast-move {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from { opacity: 0; transform: translateX(30px); }
.toast-leave-to { opacity: 0; transform: translateX(30px); }
.toast-leave-active { position: absolute; width: calc(100% - 2rem); }

@media (max-width: 600px) {
  .toast-container {
    left: 0.75rem;
    right: 0.75rem;
    top: 0.75rem;
    max-width: none;
  }
}
</style>
