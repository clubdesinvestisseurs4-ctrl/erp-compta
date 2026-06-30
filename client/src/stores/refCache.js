import { defineStore } from 'pinia';

const STORAGE_KEY = 'erp_ref_cache';
// Données de référence (plan comptable, journaux, tiers) : changent rarement en session.
// Le TTL sert de filet de sécurité pour rattraper un changement fait par un autre utilisateur
// en parallèle ; les mutations locales (création d'un compte/tiers...) invalident explicitement
// la clé concernée, donc le cas courant (un seul utilisateur qui modifie puis relit) reste à jour
// sans attendre l'expiration.
const DEFAULT_TTL = 5 * 60 * 1000;

function loadFromSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persist(cache) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage indisponible (navigation privée stricte, quota dépassé...) : cache en mémoire seulement
  }
}

// Cache client générique pour les appels GET de référence, gardé volontairement simple (pas de
// révalidation en arrière-plan) : si l'entrée est fraîche (< ttl), on la renvoie sans appel réseau ;
// sinon on refetch et on remplace. Persisté en sessionStorage pour survivre à un F5 dans l'onglet.
export const useRefCacheStore = defineStore('refCache', {
  state: () => ({ cache: loadFromSession() }),

  actions: {
    async get(key, fetcher, ttl = DEFAULT_TTL) {
      const entry = this.cache[key];
      if (entry && Date.now() - entry.fetchedAt < ttl) {
        return entry.data;
      }
      const data = await fetcher();
      this.cache[key] = { data, fetchedAt: Date.now() };
      persist(this.cache);
      return data;
    },

    // Supprime toutes les entrées dont la clé commence par `prefix` (ex: invalidate(`comptes:ohinene`)).
    invalidate(prefix) {
      let changed = false;
      for (const key of Object.keys(this.cache)) {
        if (key.startsWith(prefix)) {
          delete this.cache[key];
          changed = true;
        }
      }
      if (changed) persist(this.cache);
    },
  },
});
