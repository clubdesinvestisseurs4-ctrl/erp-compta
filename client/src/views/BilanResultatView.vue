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
const dateFin = ref('');
const periodeDateDebut = ref('');
const bilan = ref(null);
const resultat = ref(null);
const loading = ref(false);

const periodes = computed(() => optionsPeriode(exercice.value || new Date().getFullYear()));

function onPeriodeChange() {
  const p = periodes.value.find(p => p.value === periodeChoisie.value);
  if (p) {
    periodeDateDebut.value = p.dateDebut;
    dateFin.value = p.dateFin;
  }
  load();
}

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    // Le bilan est une photo cumulée depuis le début de l'exercice jusqu'à dateFin ; le compte de
    // résultat, lui, est un flux propre à la période sélectionnée (dateDebut variable).
    const debutExercice = `${exercice.value}-01-01`;
    [bilan.value, resultat.value] = await Promise.all([
      api.get(`/api/rapports/${activeSociete.value.id}/bilan?exercice=${exercice.value}&dateDebut=${debutExercice}&dateFin=${dateFin.value}`),
      api.get(`/api/rapports/${activeSociete.value.id}/resultat?exercice=${exercice.value}&dateDebut=${periodeDateDebut.value}&dateFin=${dateFin.value}`),
    ]);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function exporter() {
  if (!bilan.value || !resultat.value) return;
  const lignes = [
    ...bilan.value.actif.map(l => ({ section: 'Actif', ...l })),
    ...bilan.value.passif.map(l => ({ section: 'Passif', ...l })),
    ...resultat.value.charges.map(l => ({ section: 'Charges', ...l })),
    ...resultat.value.produits.map(l => ({ section: 'Produits', ...l })),
  ];
  exportCsv(`bilan_resultat_${activeSociete.value.id}_${periodeDateDebut.value}_${dateFin.value}.csv`, lignes, [
    { label: 'Section', key: 'section' },
    { label: 'Compte', key: 'numero' },
    { label: 'Libellé', key: 'libelle' },
    { label: 'Montant', key: 'montant' },
  ]);
}

watch(activeSociete, () => {
  if (activeSociete.value) {
    exercice.value = activeSociete.value.exerciceCourant;
    periodeChoisie.value = 'annee';
    periodeDateDebut.value = `${exercice.value}-01-01`;
    dateFin.value = `${exercice.value}-12-31`;
  }
  load();
}, { immediate: true });
</script>

<template>
  <div>
    <h1>Bilan / Compte de résultat {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

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
        <button class="btn secondary" :disabled="!bilan || !resultat" @click="exporter">Exporter CSV</button>
      </div>
      <p class="muted">Le bilan est cumulé depuis le 1er janvier {{ exercice }} jusqu'au {{ dateFin }}. Le compte de résultat ne porte que sur la période sélectionnée ({{ periodeDateDebut }} au {{ dateFin }}).</p>
    </div>

    <p v-if="loading" class="muted">Chargement...</p>

    <template v-if="bilan && resultat">
      <div class="card">
        <h2>Bilan</h2>
        <div v-if="!bilan.equilibre" class="error">
          Attention : le bilan n'est pas équilibré (Actif {{ bilan.totalActif.toLocaleString('fr-FR') }} ≠ Passif {{ bilan.totalPassif.toLocaleString('fr-FR') }}).
          Le résultat net de l'exercice doit être affecté en classe 1 (compte 120/129) pour équilibrer.
        </div>
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <h3>Actif</h3>
            <table class="table-cards">
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in bilan.actif" :key="l.numero">
                  <td data-label="Compte">{{ l.numero }}</td><td data-label="Libellé">{{ l.libelle }}</td><td class="num" data-label="Montant">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Actif</th><th class="num" data-label="Montant">{{ bilan.totalActif.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
          <div style="flex: 1; min-width: 280px;">
            <h3>Passif</h3>
            <table class="table-cards">
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in bilan.passif" :key="l.numero">
                  <td data-label="Compte">{{ l.numero }}</td><td data-label="Libellé">{{ l.libelle }}</td><td class="num" data-label="Montant">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Passif</th><th class="num" data-label="Montant">{{ bilan.totalPassif.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Compte de résultat</h2>
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <h3>Charges</h3>
            <table class="table-cards">
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in resultat.charges" :key="l.numero">
                  <td data-label="Compte">{{ l.numero }}</td><td data-label="Libellé">{{ l.libelle }}</td><td class="num" data-label="Montant">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Charges</th><th class="num" data-label="Montant">{{ resultat.totalCharges.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
          <div style="flex: 1; min-width: 280px;">
            <h3>Produits</h3>
            <table class="table-cards">
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in resultat.produits" :key="l.numero">
                  <td data-label="Compte">{{ l.numero }}</td><td data-label="Libellé">{{ l.libelle }}</td><td class="num" data-label="Montant">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Produits</th><th class="num" data-label="Montant">{{ resultat.totalProduits.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
        </div>
        <p class="mt-1"><strong>Résultat net : {{ resultat.resultatNet.toLocaleString('fr-FR') }}</strong></p>
      </div>
    </template>
  </div>
</template>
