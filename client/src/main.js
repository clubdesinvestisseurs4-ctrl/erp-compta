import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

// Si un chunk dynamique (vue lazy-loaded) échoue à charger - typiquement
// parce qu'une nouvelle version a été déployée et que les anciens hashs
// de fichiers n'existent plus - on recharge la page pour récupérer le
// nouvel index.html avec les bons hashs.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});
