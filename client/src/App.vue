<script setup>
import { onMounted, watch } from 'vue';
import { useAuthStore } from './stores/auth';
import { useSocieteStore } from './stores/societe';
import AppHeader from './components/AppHeader.vue';

const auth = useAuthStore();
const societeStore = useSocieteStore();

onMounted(() => {
  if (auth.isAuthenticated) {
    societeStore.fetchSocietes();
  }
});

watch(() => auth.isAuthenticated, (isAuth) => {
  if (isAuth) {
    societeStore.fetchSocietes();
  }
});
</script>

<template>
  <div class="layout-vertical" :class="{ 'with-sidebar': auth.isAuthenticated }">
    <AppHeader v-if="auth.isAuthenticated" />
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout-vertical {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.layout-vertical.with-sidebar {
  flex-direction: row;
}

@media (max-width: 860px) {
  .layout-vertical.with-sidebar {
    flex-direction: column;
  }
}
</style>
