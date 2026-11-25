<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useI18n } from '../i18n';

const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const { locale, t, isEnglish } = useI18n();

const username = ref('');
const password = ref('');
const loading = ref(false);

async function onSubmit() {
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push({ name: 'dashboard' });
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="onSubmit">
      <label class="language-picker">
        <span>{{ t('language') }}</span>
        <select v-model="locale" :aria-label="t('language')">
          <option value="fr">{{ locale === 'en' ? 'French' : 'Français' }}</option>
          <option value="en">English</option>
        </select>
      </label>
      <h1>ERP Compta</h1>
      <p class="muted">Ohinéné &amp; Cook Africa — {{ isEnglish ? 'SYSCOHADA accounting' : 'Comptabilité SYSCOHADA' }}</p>

      <label>
        {{ t('username') }}
        <input v-model="username" type="text" autocomplete="username" required />
      </label>

      <label>
        {{ t('password') }}
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? t('signingIn') : t('signIn') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.login-card {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.language-picker { display: flex; align-items: center; justify-content: flex-end; gap: 0.6rem; font-size: 0.9rem; }
.language-picker select { width: auto; min-width: 110px; }
</style>
