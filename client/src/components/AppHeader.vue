<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSocieteStore } from '../stores/societe';
import { useI18n } from '../i18n';

const router = useRouter();
const auth = useAuthStore();
const societeStore = useSocieteStore();
const { locale, t } = useI18n();

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
      <button class="menu-toggle" type="button" @click="toggleMenu" :aria-label="t('menu')">☰</button>
    </div>

    <label class="language-picker">
      <span>{{ t('language') }}</span>
      <select v-model="locale" :aria-label="t('language')">
        <option value="fr">{{ locale === 'en' ? 'French' : 'Français' }}</option>
        <option value="en">English</option>
      </select>
    </label>

    <select v-if="societes.length" class="societe-select" :value="societeStore.activeSocieteId" @change="onSocieteChange">
      <option v-for="s in societes" :key="s.id" :value="s.id">{{ s.nom }}</option>
    </select>

    <nav class="nav-links" @click="closeMenu">
      <RouterLink to="/">{{ t('dashboard') }}</RouterLink>
      <RouterLink to="/plan-comptable">{{ t('chartOfAccounts') }}</RouterLink>
      <RouterLink to="/journaux">{{ t('journals') }}</RouterLink>
      <RouterLink to="/ecritures">{{ t('entries') }}</RouterLink>
      <RouterLink to="/modeles-ecriture">{{ t('recurringTemplates') }}</RouterLink>
      <RouterLink to="/grand-livre">{{ t('generalLedger') }}</RouterLink>
      <RouterLink to="/balance">{{ t('trialBalance') }}</RouterLink>
      <RouterLink to="/bilan-resultat">{{ t('incomeStatement') }}</RouterLink>
      <RouterLink to="/esg">{{ t('managementBalances') }}</RouterLink>
      <RouterLink to="/flux-tresorerie">{{ t('cashFlow') }}</RouterLink>
      <RouterLink to="/audit-flash">{{ t('audit') }}</RouterLink>
      <RouterLink to="/import-cookafrica">{{ t('importCook') }}</RouterLink>
      <RouterLink to="/tiers">{{ t('thirdParties') }}</RouterLink>
      <RouterLink to="/commandes">{{ t('purchaseOrders') }}</RouterLink>
      <RouterLink to="/factures">{{ t('salesInvoices') }}</RouterLink>
      <RouterLink to="/balance-auxiliaire">{{ t('subsidiaryLedger') }}</RouterLink>
      <RouterLink to="/lettrage">{{ t('reconciliation') }}</RouterLink>
      <RouterLink to="/rapprochement-bancaire">{{ t('bankReconciliation') }}</RouterLink>
      <RouterLink to="/declaration-tva">{{ t('vatReturn') }}</RouterLink>
      <RouterLink to="/pointages">{{ t('attendance') }}</RouterLink>
      <RouterLink to="/paie">{{ t('payroll') }}</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/employes">{{ t('staff') }}</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/societes">{{ t('companies') }}</RouterLink>
      <RouterLink v-if="auth.isAdmin" to="/cloture-exercice">{{ t('yearEnd') }}</RouterLink>
    </nav>

    <div class="sidebar-footer">
      <span class="muted">{{ auth.user?.nom }}</span>
      <button class="btn secondary" @click="logout">{{ t('logout') }}</button>
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
  transition: transform 0.2s ease, background 0.15s ease;
}

.menu-toggle:hover { background: var(--color-primary-light); }

.app-sidebar.menu-open .menu-toggle { transform: rotate(90deg); }

.societe-select {
  width: 100%;
  transition: opacity 0.2s ease;
}

.language-picker { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; color: #dce6f0; font-size: 0.85rem; }
.language-picker select { width: auto; min-width: 110px; }

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
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, padding-left 0.15s ease;
}

.nav-links a:hover {
  background: var(--color-primary-light);
  padding-left: 0.7rem;
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
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    transition: max-height 0.25s ease, opacity 0.2s ease;
  }

  .app-sidebar.menu-open .societe-select,
  .app-sidebar.menu-open .nav-links,
  .app-sidebar.menu-open .sidebar-footer {
    max-height: 1200px;
    opacity: 1;
    overflow: visible;
    pointer-events: auto;
  }

  .nav-links {
    flex-direction: column;
    display: flex;
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
