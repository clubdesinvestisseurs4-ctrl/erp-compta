<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSocieteStore } from '../stores/societe';

const router = useRouter();
const auth = useAuthStore();
const societeStore = useSocieteStore();

const societes = computed(() => societeStore.societes);

function onSocieteChange(e) {
  societeStore.setActiveSociete(e.target.value);
}

function logout() {
  auth.logout();
  societeStore.reset();
  router.push({ name: 'login' });
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-icon">EC</span>
      <span>ERP Compta</span>
    </div>

    <nav class="nav-links">
      <RouterLink to="/">Tableau de bord</RouterLink>
      <RouterLink to="/plan-comptable">Plan comptable</RouterLink>
      <RouterLink to="/journaux">Journaux</RouterLink>
      <RouterLink to="/ecritures">Écritures</RouterLink>
      <RouterLink to="/grand-livre">Grand livre</RouterLink>
      <RouterLink to="/balance">Balance</RouterLink>
      <RouterLink to="/bilan-resultat">Bilan / Résultat</RouterLink>
      <RouterLink to="/tiers">Tiers</RouterLink>
      <RouterLink to="/balance-auxiliaire">Balance auxiliaire</RouterLink>
      <RouterLink to="/pointages">Pointages</RouterLink>
      <RouterLink to="/paie">Paie</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/employes">Personnel</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/societes">Sociétés</RouterLink>
    </nav>

    <div class="header-right">
      <select v-if="societes.length" :value="societeStore.activeSocieteId" @change="onSocieteChange">
        <option v-for="s in societes" :key="s.id" :value="s.id">{{ s.nom }}</option>
      </select>
      <span class="muted">{{ auth.user?.nom }}</span>
      <button class="btn secondary" @click="logout">Déconnexion</button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  background: var(--color-primary);
  color: #fff;
  padding: 0.6rem 1.25rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.05rem;
}

.brand-icon {
  background: var(--color-accent);
  color: #1e3a5f;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-size: 0.8rem;
}

.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  flex: 1;
}

.nav-links a {
  color: #dce6f0;
  font-size: 0.9rem;
}

.nav-links a.router-link-active {
  color: #fff;
  font-weight: 600;
  border-bottom: 2px solid var(--color-accent);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.header-right .muted {
  color: #cfd9e3;
}
</style>
