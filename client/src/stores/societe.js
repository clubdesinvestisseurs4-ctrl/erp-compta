import { defineStore } from 'pinia';
import { api } from '../api/client';

export const useSocieteStore = defineStore('societe', {
  state: () => ({
    societes: [],
    activeSocieteId: localStorage.getItem('erp_societe') || null,
    loadError: null,
  }),

  getters: {
    activeSociete: (state) => state.societes.find(s => s.id === state.activeSocieteId) || null,
  },

  actions: {
    async fetchSocietes() {
      this.loadError = null;
      try {
        this.societes = await api.get('/api/societes');
        if (!this.activeSocieteId && this.societes.length > 0) {
          this.setActiveSociete(this.societes[0].id);
        }
      } catch (error) {
        this.loadError = error?.message || 'Unable to load companies.';
        throw error;
      }
    },

    setActiveSociete(societeId) {
      this.activeSocieteId = societeId;
      localStorage.setItem('erp_societe', societeId);
    },

    reset() {
      this.societes = [];
      this.activeSocieteId = null;
      this.loadError = null;
      localStorage.removeItem('erp_societe');
    },
  },
});
