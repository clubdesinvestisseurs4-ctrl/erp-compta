<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const type = ref('client');
const exercice = ref(null);
const result = ref(null);
const error = ref('');
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    result.value = await api.get(`/api/rapports/${activeSociete.value.id}/balance-auxiliaire?type=${type.value}&exercice=${exercice.value}`);
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
watch(type, load);
</script>

<template>
  <div>
    <h1>Balance auxiliaire {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          <input type="radio" value="client" v-model="type" /> Clients
        </label>
        <label>
          <input type="radio" value="fournisseur" v-model="type" /> Fournisseurs
        </label>
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
            <th>Nom</th>
            <th class="num">Total débit</th>
            <th class="num">Total crédit</th>
            <th class="num">Solde</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in result.lignes" :key="l.id">
            <td>{{ l.compteNumero }}</td>
            <td>{{ l.nom }}</td>
            <td class="num">{{ l.totalDebit.toLocaleString('fr-FR') }}</td>
            <td class="num">{{ l.totalCredit.toLocaleString('fr-FR') }}</td>
            <td class="num">{{ l.solde.toLocaleString('fr-FR') }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>Totaux</th>
            <th></th>
            <th class="num">{{ result.totaux.totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ result.totaux.totalCredit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ result.totaux.solde.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="muted">Aucun {{ type === 'client' ? 'client' : 'fournisseur' }} enregistré.</p>
    </div>
    <p v-else-if="loading" class="muted">Chargement...</p>
  </div>
</template>
