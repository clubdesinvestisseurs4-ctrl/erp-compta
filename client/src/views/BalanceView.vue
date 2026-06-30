<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { exportCsv } from '../utils/csv';
import { optionsPeriode } from '../utils/periode';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const exercice = ref(null);
const periodeChoisie = ref('annee');
const dateDebut = ref('');
const dateFin = ref('');
const result = ref(null);
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
  loading.value = true;
  try {
    result.value = await api.get(`/api/rapports/${activeSociete.value.id}/balance?exercice=${exercice.value}&dateDebut=${dateDebut.value}&dateFin=${dateFin.value}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function exporter() {
  if (!result.value) return;
  exportCsv(`balance_${activeSociete.value.id}_${dateDebut.value}_${dateFin.value}.csv`, result.value.lignes, [
    { label: 'Compte', key: 'numero' },
    { label: 'Libellé', key: 'libelle' },
    { label: 'Total débit', key: 'totalDebit' },
    { label: 'Total crédit', key: 'totalCredit' },
    { label: 'Solde débiteur', key: 'soldeDebiteur' },
    { label: 'Solde créditeur', key: 'soldeCrediteur' },
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
</script>

<template>
  <div>
    <h1>Balance générale {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <div class="form-row">
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
        <label>
          Du
          <input v-model="dateDebut" type="date" @change="load" />
        </label>
        <label>
          Au
          <input v-model="dateFin" type="date" @change="load" />
        </label>
        <button class="btn secondary" :disabled="!result" @click="exporter">Exporter CSV</button>
      </div>
    </div>

    <div class="card" v-if="result">
      <table v-if="result.lignes.length" class="table-cards">
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
            <td data-label="Compte">{{ l.numero }}</td>
            <td data-label="Libellé">{{ l.libelle }}</td>
            <td class="num" data-label="Total débit">{{ l.totalDebit.toLocaleString('fr-FR') }}</td>
            <td class="num" data-label="Total crédit">{{ l.totalCredit.toLocaleString('fr-FR') }}</td>
            <td class="num" data-label="Solde débiteur">{{ l.soldeDebiteur ? l.soldeDebiteur.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Solde créditeur">{{ l.soldeCrediteur ? l.soldeCrediteur.toLocaleString('fr-FR') : '' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            <th class="num" data-label="Total débit">{{ result.totaux.totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Total crédit">{{ result.totaux.totalCredit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Solde débiteur">{{ result.totaux.soldeDebiteur.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Solde créditeur">{{ result.totaux.soldeCrediteur.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="muted">Aucun mouvement sur cet exercice.</p>
    </div>
    <p v-else-if="loading" class="muted">Chargement...</p>
  </div>
</template>
