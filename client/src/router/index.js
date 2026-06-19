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
  { path: '/employes', name: 'employes', component: () => import('../views/EmployesView.vue'), meta: { adminOnly: true } },
  { path: '/pointages', name: 'pointages', component: () => import('../views/PointagesView.vue') },
  { path: '/paie', name: 'paie', component: () => import('../views/PaieView.vue') },
  { path: '/paie/:id/bulletin', name: 'paie-bulletin', component: () => import('../views/BulletinPaieView.vue') },
  { path: '/tiers', name: 'tiers', component: () => import('../views/TiersView.vue') },
  { path: '/commandes', name: 'commandes', component: () => import('../views/CommandesView.vue') },
  { path: '/balance-auxiliaire', name: 'balance-auxiliaire', component: () => import('../views/BalanceAuxiliaireView.vue') },
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
