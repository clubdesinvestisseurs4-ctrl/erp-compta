<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const exercice = ref(null);
const result = ref(null);
const error = ref('');
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    result.value = await api.get(`/api/rapports/${activeSociete.value.id}/balance?exercice=${exercice.value}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

watch(activeSociete, () => {
  if (activeSociete.value) {
    exercice.value = activeSociete.value.exerciceCourant;
  }
  load();
}, { immediate: true });
</script>

<template>
  <div>
    <h1>Balance générale {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Exercice
          <input v-model.number="exercice" type="number" @change="load" />
        </label>
      </div>
    </div>

    <div class="card" v-if="result">
      <table v-if="result.lignes.length">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Libellé</th>
            <th class="num">Total débit</th>
            <th class="num">Total crédit</th>
            <th class="num">Solde débiteur</th>
            <th class="num">Solde créditeur</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in result.lignes" :key="l.numero">
            <td>{{ l.numero }}</td>
            <td>{{ l.libelle }}</td>
            <td class="num">{{ l.totalDebit.toLocaleString('fr-FR') }}</td>
            <td class="num">{{ l.totalCredit.toLocaleString('fr-FR') }}</td>
            <td class="num">{{ l.soldeDebiteur ? l.soldeDebiteur.toLocaleString('fr-FR') : '' }}</td>
            <td class="num">{{ l.soldeCrediteur ? l.soldeCrediteur.toLocaleString('fr-FR') : '' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            <th class="num">{{ result.totaux.totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ result.totaux.totalCredit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ result.totaux.soldeDebiteur.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ result.totaux.soldeCrediteur.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="muted">Aucun mouvement sur cet exercice.</p>
    </div>
    <p v-else-if="loading" class="muted">Chargement...</p>
  </div>
</template>
