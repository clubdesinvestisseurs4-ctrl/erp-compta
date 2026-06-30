<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { exportCsv } from '../utils/csv';
import { optionsPeriode } from '../utils/periode';
import { useToastStore } from '../stores/toast';
import { useRefCacheStore } from '../stores/refCache';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();
const refCache = useRefCacheStore();

const comptes = ref([]);
const compteSelectionne = ref('');
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

async function loadComptes() {
  if (!activeSociete.value) return;
  const societeId = activeSociete.value.id;
  comptes.value = await refCache.get(`comptes:${societeId}`, () => api.get(`/api/comptes/${societeId}`));
}

async function load() {
  if (!activeSociete.value || !compteSelectionne.value) return;
  loading.value = true;
  try {
    result.value = await api.get(
      `/api/rapports/${activeSociete.value.id}/grand-livre?compte=${compteSelectionne.value}&exercice=${exercice.value}&dateDebut=${dateDebut.value}&dateFin=${dateFin.value}`
    );
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function exporter() {
  if (!result.value) return;
  exportCsv(`grand_livre_${compteSelectionne.value}_${dateDebut.value}_${dateFin.value}.csv`, result.value.lignes, [
    { label: 'Date', key: 'date' },
    { label: 'Journal', key: 'journalCode' },
    { label: 'N°', key: 'numero' },
    { label: 'Libellé', key: 'libelle' },
    { label: 'Débit', key: 'debit' },
    { label: 'Crédit', key: 'credit' },
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
  loadComptes();
}, { immediate: true });
</script>

<template>
  <div>
    <h1>Grand livre {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <div class="form-row">
        <label>
          Compte
          <select v-model="compteSelectionne" @change="load">
            <option value="">— Choisir un compte —</option>
            <option v-for="c in comptes" :key="c.numero" :value="c.numero">{{ c.numero }} — {{ c.libelle }}</option>
          </select>
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
      <p>Solde initial au {{ dateDebut }} : <strong>{{ result.soldeInitial.toLocaleString('fr-FR') }}</strong></p>
      <table class="table-cards">
        <thead>
          <tr>
            <th>Date</th>
            <th>Journal</th>
            <th>N°</th>
            <th>Libellé</th>
            <th class="num">Débit</th>
            <th class="num">Crédit</th>
            <th class="num">Solde</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in result.lignes" :key="i">
            <td data-label="Date">{{ l.date }}</td>
            <td data-label="Journal">{{ l.journalCode }}</td>
            <td data-label="N°">{{ l.numero }}</td>
            <td data-label="Libellé">{{ l.libelle }}</td>
            <td class="num" data-label="Débit">{{ l.debit ? l.debit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Crédit">{{ l.credit ? l.credit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Solde">{{ l.solde.toLocaleString('fr-FR') }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="4">Totaux de la période</th>
            <th class="num" data-label="Débit">{{ result.totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Crédit">{{ result.totalCredit.toLocaleString('fr-FR') }}</th>
            <th class="num" data-label="Solde">{{ result.soldeFinal.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-if="!result.lignes.length" class="muted">Aucun mouvement pour ce compte sur cette période.</p>
    </div>
    <p v-else-if="loading" class="muted">Chargement...</p>
  </div>
</template>
