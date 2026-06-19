<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { exportCsv } from '../utils/csv';
import { optionsPeriode } from '../utils/periode';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const type = ref('client');
const exercice = ref(null);
const periodeChoisie = ref('annee');
const dateDebut = ref('');
const dateFin = ref('');
const result = ref(null);
const error = ref('');
const loading = ref(false);

const periodes = computed(() => optionsPeriode(exercice.value || new Date().getFullYear()));

function onPeriodeChange() {
  const p = periodes.value.find(p => p.value === periodeChoisie.value);
  if (p) {
    dateDebut.value = p.dateDebut;
    dateFin.value = p.dateFin;
  }
  load();
}

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    result.value = await api.get(`/api/rapports/${activeSociete.value.id}/balance-auxiliaire?type=${type.value}&exercice=${exercice.value}&dateDebut=${dateDebut.value}&dateFin=${dateFin.value}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function exporter() {
  if (!result.value) return;
  exportCsv(`balance_auxiliaire_${type.value}_${activeSociete.value.id}_${dateDebut.value}_${dateFin.value}.csv`, result.value.lignes, [
    { label: 'Compte', key: 'compteNumero' },
    { label: 'Nom', key: 'nom' },
    { label: 'Total débit', key: 'totalDebit' },
    { label: 'Total crédit', key: 'totalCredit' },
    { label: 'Solde', key: 'solde' },
  ]);
}

watch(activeSociete, () => {
  if (activeSociete.value) {
    exercice.value = activeSociete.value.exerciceCourant;
    periodeChoisie.value = 'annee';
    dateDebut.value = `${exercice.value}-01-01`;
    dateFin.value = `${exercice.value}-12-31`;
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
          <input v-model.number="exercice" type="number" @change="onPeriodeChange" />
        </label>
        <label>
          Période
          <select v-model="periodeChoisie" @change="onPeriodeChange">
            <option v-for="p in periodes" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </label>
        <button class="btn secondary" :disabled="!result" @click="exporter">Exporter CSV</button>
      </div>
    </div>

    <div class="card" v-if="result">
      <table v-if="result.lignes.length" class="table-cards">
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
            <td data-label="Compte">{{ l.compteNumero }}</td>
            <td data-label="Nom">{{ l.nom }}</td>
            <td class="num" data-label="Total débit">{{ l.totalDebit.toLocaleString('fr-FR') }}</td>
            <td class="num" data-label="Total crédit">{{ l.totalCredit.toLocaleString('fr-FR') }}</td>
            <td class="num" data-label="Solde">{{ l.solde.toLocaleString('fr-FR') }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>Totaux</th>
            <th></th>
            <th class="num" data-label="Total débit">{{ result.totaux.totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Total crédit">{{ result.totaux.totalCredit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Solde">{{ result.totaux.solde.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="muted">Aucun {{ type === 'client' ? 'client' : 'fournisseur' }} enregistré.</p>
    </div>
    <p v-else-if="loading" class="muted">Chargement...</p>
  </div>
</template>
