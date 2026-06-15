import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { path: '/societes', name: 'societes', component: () => import('../views/SocietesView.vue'), meta: { adminOnly: true } },
  { path: '/plan-comptable', name: 'plan-comptable', component: () => import('../views/PlanComptableView.vue') },
  { path: '/journaux', name: 'journaux', component: () => import('../views/JournauxView.vue') },
  { path: '/ecritures', name: 'ecritures', component: () => import('../views/EcrituresListView.vue') },
  { path: '/ecritures/nouvelle', name: 'ecriture-nouvelle', component: () => import('../views/EcritureFormView.vue') },
  { path: '/grand-livre', name: 'grand-livre', component: () => import('../views/GrandLivreView.vue') },
  { path: '/balance', name: 'balance', component: () => import('../views/BalanceView.vue') },
  { path: '/bilan-resultat', name: 'bilan-resultat', component: () => import('../views/BilanResultatView.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  if (to.meta.adminOnly && !auth.isAdmin) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
