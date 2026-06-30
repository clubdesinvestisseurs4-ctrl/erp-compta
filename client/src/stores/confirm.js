import { defineStore } from 'pinia';

// Boîte de dialogue de confirmation globale, basée sur une promesse (remplace window.confirm()).
// Usage : const confirmStore = useConfirmStore(); if (!(await confirmStore.ask('Supprimer ?'))) return;
export const useConfirmStore = defineStore('confirm', {
  state: () => ({
    visible: false,
    title: '',
    message: '',
    danger: false,
    confirmLabel: 'Confirmer',
    cancelLabel: 'Annuler',
    resolver: null,
  }),

  actions: {
    ask(message, { title = '', danger = false, confirmLabel = 'Confirmer', cancelLabel = 'Annuler' } = {}) {
      this.title = title;
      this.message = message;
      this.danger = danger;
      this.confirmLabel = confirmLabel;
      this.cancelLabel = cancelLabel;
      this.visible = true;
      return new Promise((resolve) => {
        this.resolver = resolve;
      });
    },
    resolve(value) {
      this.visible = false;
      if (this.resolver) {
        this.resolver(value);
        this.resolver = null;
      }
    },
  },
});
