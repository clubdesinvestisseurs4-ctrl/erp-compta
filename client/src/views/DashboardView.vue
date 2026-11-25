<script setup>
import { computed, ref, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';
import { useI18n } from '../i18n';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();
const { t } = useI18n();

const resultat = ref(null);
const loading = ref(false);

async function loadResultat() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    resultat.value = await api.get(`/api/rapports/${activeSociete.value.id}/resultat?exercice=${activeSociete.value.exerciceCourant}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

watch(activeSociete, loadResultat, { immediate: true });

function retryLoadSocietes() {
  societeStore.fetchSocietes().catch(() => {});
}
</script>

<template>
  <div>
    <h1>{{ t('dashboard') }}</h1>

    <div v-if="!activeSociete" class="card">
      <p>{{ societeStore.loadError || t('loadingCompanies') }}</p>
      <button v-if="societeStore.loadError" class="btn" type="button" @click="retryLoadSocietes">{{ t('retry') }}</button>
    </div>

    <template v-else>
      <div class="card">
        <h2>{{ activeSociete.nom }}</h2>
        <p class="muted">
          {{ t('fiscalYear') }} {{ activeSociete.exerciceCourant }} — {{ t('currency') }} {{ activeSociete.devise }}
        </p>
      </div>

      <div v-if="loading" class="card">{{ t('loading') }}</div>

      <div v-else-if="resultat" class="card">
        <h2>{{ t('incomeSummary') }}</h2>
        <table>
          <tbody>
            <tr>
              <td>{{ t('totalIncome') }}</td>
              <td class="num">{{ resultat.totalProduits.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td>{{ t('totalExpenses') }}</td>
              <td class="num">{{ resultat.totalCharges.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td><strong>{{ t('netIncome') }}</strong></td>
              <td class="num"><strong>{{ resultat.resultatNet.toLocaleString('fr-FR') }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>{{ t('quickLinks') }}</h2>
        <p>
          <RouterLink to="/ecritures/nouvelle" class="btn">{{ t('newEntry') }}</RouterLink>
        </p>
        <p class="muted">
          {{ t('dashboardHint') }}
        </p>
      </div>
    </template>
  </div>
</template>
