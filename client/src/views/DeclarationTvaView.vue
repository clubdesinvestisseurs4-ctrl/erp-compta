<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const today = new Date().toISOString().slice(0, 10);
const debutMois = today.slice(0, 8) + '01';

const dateDebut = ref(debutMois);
const dateFin = ref(today);
const declaration = ref(null);
const loading = ref(false);

async function calculer() {
  if (!activeSociete.value) return;
  declaration.value = null;
  loading.value = true;
  try {
    declaration.value = await api.get(
      `/api/rapports/${activeSociete.value.id}/declaration-tva?dateDebut=${dateDebut.value}&dateFin=${dateFin.value}`
    );
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

watch(activeSociete, () => { declaration.value = null; }, { immediate: true });
</script>

<template>
  <div>
    <h1>Déclaration de TVA {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <div class="form-row">
        <label>
          Du
          <input v-model="dateDebut" type="date" />
        </label>
        <label>
          Au
          <input v-model="dateFin" type="date" />
        </label>
        <button class="btn" :disabled="loading" @click="calculer">{{ loading ? 'Calcul...' : 'Calculer' }}</button>
      </div>
      <p class="muted">TVA collectée = compte 4431 (sur ventes). TVA déductible = comptes 4452/4454/4456 (sur achats, services, immobilisations).</p>
    </div>

    <div v-if="declaration" class="card">
      <div class="form-row">
        <span>TVA collectée : <strong>{{ declaration.tvaCollectee.toLocaleString('fr-FR') }}</strong></span>
        <span>TVA déductible : <strong>{{ declaration.tvaDeductible.toLocaleString('fr-FR') }}</strong></span>
        <span>
          TVA nette : <strong>{{ declaration.tvaNette.toLocaleString('fr-FR') }}</strong>
          ({{ declaration.sens === 'a_payer' ? 'à payer' : 'crédit de TVA à reporter' }})
        </span>
      </div>
    </div>
  </div>
</template>
