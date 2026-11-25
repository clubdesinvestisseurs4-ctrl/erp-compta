<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { locale, translateDocument, translateNode } from './i18n';
import { useAuthStore } from './stores/auth';
import { useSocieteStore } from './stores/societe';
import AppHeader from './components/AppHeader.vue';
import ToastContainer from './components/ToastContainer.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

const route = useRoute();
const auth = useAuthStore();
const societeStore = useSocieteStore();
let translationObserver;

watch(locale, () => translateDocument());

onMounted(() => {
  translateDocument();
  translationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      else if (mutation.type === 'attributes') translateNode(mutation.target);
      else for (const node of mutation.addedNodes) translateNode(node);
    }
  });
  translationObserver.observe(document.body, {
    childList: true,
    characterData: true,
    attributes: true,
    subtree: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'data-label'],
  });
  if (auth.isAuthenticated) {
    auth.scheduleExpiry();
    societeStore.fetchSocietes();
  }
});

onBeforeUnmount(() => translationObserver?.disconnect());

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
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </RouterView>
    </main>
    <ToastContainer />
    <ConfirmDialog />
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

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
