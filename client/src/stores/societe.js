import { defineStore } from 'pinia';
import { api } from '../api/client';

export const useSocieteStore = defineStore('societe', {
  state: () => ({
    societes: [],
    activeSocieteId: localStorage.getItem('erp_societe') || null,
  }),

  getters: {
    activeSociete: (state) => state.societes.find(s => s.id === state.activeSocieteId) || null,
  },

  actions: {
    async fetchSocietes() {
      this.societes = await api.get('/api/societes');
      if (!this.activeSocieteId && this.societes.length > 0) {
        this.setActiveSociete(this.societes[0].id);
      }
    },

    setActiveSociete(societeId) {
      this.activeSocieteId = societeId;
      localStorage.setItem('erp_societe', societeId);
    },

    reset() {
      this.societes = [];
      this.activeSocieteId = null;
      localStorage.removeItem('erp_societe');
    },
  },
});
