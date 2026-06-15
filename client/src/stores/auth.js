import { defineStore } from 'pinia';
import { api } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('erp_token') || null,
    user: JSON.parse(localStorage.getItem('erp_user') || 'null'),
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === 'admin',
  },

  actions: {
    async login(username, password) {
      const data = await api.post('/api/auth/login', { username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('erp_token', data.token);
      localStorage.setItem('erp_user', JSON.stringify(data.user));
    },

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
    },
  },
});
