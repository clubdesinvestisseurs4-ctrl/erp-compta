import { defineStore } from 'pinia';

let nextId = 1;

// Notifications pop-up globales (succès/erreur/info), affichées par ToastContainer.vue.
// Remplace l'ancien pattern par-vue (ref error/success + <div class="error/success">).
export const useToastStore = defineStore('toast', {
  state: () => ({ toasts: [] }),

  actions: {
    push(type, message, duration = type === 'error' ? 6000 : 4000) {
      const id = nextId++;
      this.toasts.push({ id, type, message });
      if (duration > 0) {
        setTimeout(() => this.remove(id), duration);
      }
      return id;
    },
    success(message, duration) {
      return this.push('success', message, duration);
    },
    error(message, duration) {
      return this.push('error', message, duration);
    },
    info(message, duration) {
      return this.push('info', message, duration);
    },
    remove(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
  },
});
