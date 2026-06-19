<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSocieteStore } from '../stores/societe';

const router = useRouter();
const auth = useAuthStore();
const societeStore = useSocieteStore();

const societes = computed(() => societeStore.societes);
const menuOpen = ref(false);

function onSocieteChange(e) {
  societeStore.setActiveSociete(e.target.value);
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function logout() {
  closeMenu();
  auth.logout();
  societeStore.reset();
  router.push({ name: 'login' });
}
</script>

<template>
  <header class="app-sidebar" :class="{ 'menu-open': menuOpen }">
    <div class="brand-row">
      <div class="brand">
        <span class="brand-icon">EC</span>
        <span>ERP Compta</span>
      </div>
      <button class="menu-toggle" type="button" @click="toggleMenu" aria-label="Menu">☰</button>
    </div>

    <select v-if="societes.length" class="societe-select" :value="societeStore.activeSocieteId" @change="onSocieteChange">
      <option v-for="s in societes" :key="s.id" :value="s.id">{{ s.nom }}</option>
    </select>

    <nav class="nav-links" @click="closeMenu">
      <RouterLink to="/">Tableau de bord</RouterLink>
      <RouterLink to="/plan-comptable">Plan comptable</RouterLink>
      <RouterLink to="/journaux">Journaux</RouterLink>
      <RouterLink to="/ecritures">Écritures</RouterLink>
      <RouterLink to="/modeles-ecriture">Modèles récurrents</RouterLink>
      <RouterLink to="/grand-livre">Grand livre</RouterLink>
      <RouterLink to="/balance">Balance</RouterLink>
      <RouterLink to="/bilan-resultat">Bilan / Résultat</RouterLink>
      <RouterLink to="/esg">Soldes de gestion</RouterLink>
      <RouterLink to="/flux-tresorerie">Flux de trésorerie</RouterLink>
      <RouterLink to="/tiers">Tiers</RouterLink>
      <RouterLink to="/commandes">Bons de commande</RouterLink>
      <RouterLink to="/factures">Factures de vente</RouterLink>
      <RouterLink to="/balance-auxiliaire">Balance auxiliaire</RouterLink>
      <RouterLink to="/lettrage">Lettrage</RouterLink>
      <RouterLink to="/rapprochement-bancaire">Rapprochement bancaire</RouterLink>
      <RouterLink to="/declaration-tva">Déclaration TVA</RouterLink>
      <RouterLink to="/pointages">Pointages</RouterLink>
      <RouterLink to="/paie">Paie</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/employes">Personnel</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/societes">Sociétés</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/cloture-exercice">Clôture d'exercice</RouterLink>
    </nav>

    <div class="sidebar-footer">
      <span class="muted">{{ auth.user?.nom }}</span>
      <button class="btn secondary" @click="logout">Déconnexion</button>
    </div>
  </header>
</template>

<style scoped>
.app-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 220px;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  align-self: flex-start;
  background: var(--color-primary);
  color: #fff;
  padding: 0.9rem 1rem;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.menu-toggle {
  display: none;
  background: none;
  border: 1px solid var(--color-primary-light);
  color: #fff;
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  font-size: 1.1rem;
  cursor: pointer;
}

.societe-select {
  width: 100%;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  overflow-y: auto;
}

.nav-links a {
  color: #dce6f0;
  font-size: 0.9rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  border-left: 3px solid transparent;
}

.nav-links a:hover {
  background: var(--color-primary-light);
}

.nav-links a.router-link-active {
  color: #fff;
  font-weight: 600;
  background: var(--color-primary-light);
  border-left: 3px solid var(--color-accent);
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-primary-light);
}

.sidebar-footer .muted {
  color: #cfd9e3;
}

@media (max-width: 860px) {
  .app-sidebar {
    width: 100%;
    height: auto;
    max-height: 100vh;
    overflow-y: auto;
    flex-direction: column;
    gap: 0.5rem;
  }

  .menu-toggle {
    display: block;
  }

  .societe-select,
  .nav-links,
  .sidebar-footer {
    display: none;
  }

  .app-sidebar.menu-open .societe-select {
    display: block;
  }

  .app-sidebar.menu-open .nav-links,
  .app-sidebar.menu-open .sidebar-footer {
    display: flex;
  }

  .nav-links {
    flex-direction: column;
    overflow-y: visible;
  }

  .nav-links a.router-link-active {
    border-left: 3px solid var(--color-accent);
    border-bottom: none;
  }

  .sidebar-footer {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
