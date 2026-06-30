<script setup>
import { useConfirmStore } from '../stores/confirm';

const store = useConfirmStore();
</script>

<template>
  <Transition name="confirm-modal">
    <div v-if="store.visible" class="confirm-overlay" @click.self="store.resolve(false)">
      <div class="confirm-box" :class="{ danger: store.danger }" role="alertdialog" aria-modal="true">
        <h3 v-if="store.title" class="confirm-title">{{ store.title }}</h3>
        <p class="confirm-message">{{ store.message }}</p>
        <div class="confirm-actions">
          <button class="btn secondary" type="button" @click="store.resolve(false)">{{ store.cancelLabel }}</button>
          <button
            class="btn"
            :class="{ danger: store.danger }"
            type="button"
            autofocus
            @click="store.resolve(true)"
          >
            {{ store.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 32, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 2100;
}

.confirm-box {
  background: #fff;
  border-radius: 10px;
  padding: 1.5rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
  border-top: 4px solid var(--color-primary);
}

.confirm-box.danger { border-top-color: var(--color-credit); }

.confirm-title { margin: 0 0 0.5rem; font-size: 1.1rem; }

.confirm-message { margin: 0 0 1.25rem; color: var(--color-text); line-height: 1.5; }

.confirm-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }

.confirm-modal-enter-active, .confirm-modal-leave-active { transition: opacity 0.18s ease; }
.confirm-modal-enter-from, .confirm-modal-leave-to { opacity: 0; }
.confirm-modal-enter-active .confirm-box, .confirm-modal-leave-active .confirm-box {
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
}
.confirm-modal-enter-from .confirm-box, .confirm-modal-leave-to .confirm-box {
  transform: scale(0.92) translateY(10px);
  opacity: 0;
}
</style>
