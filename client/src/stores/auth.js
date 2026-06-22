import { defineStore } from 'pinia';
import { api } from '../api/client';
import { TOKEN_KEY, USER_KEY, saveSession, clearSession, forceLogout, getTokenExpiryMs } from '../utils/session';

// Identifiant de setTimeout hors de l'état réactif (rien à persister/sérialiser ici).
let expiryTimer = null;

function clearExpiryTimer() {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
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
      saveSession(data.token, data.user);
      this.scheduleExpiry();
    },

    logout() {
      clearExpiryTimer();
      this.token = null;
      this.user = null;
      clearSession();
    },

    // Programme une déconnexion automatique à l'instant exact d'expiration du token,
    // pour ne pas attendre le prochain appel API rejeté (intercepteur dans api/client.js).
    // À appeler après login() et au démarrage de l'app (token déjà présent en localStorage).
    scheduleExpiry() {
      clearExpiryTimer();
      if (!this.token) return;

      const expiryMs = getTokenExpiryMs(this.token);
      if (!expiryMs) return;

      const delay = expiryMs - Date.now();
      if (delay <= 0) {
        forceLogout();
        return;
      }
      expiryTimer = setTimeout(() => forceLogout(), delay);
    },
  },
});
