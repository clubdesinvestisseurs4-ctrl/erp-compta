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
const esg = ref(null);
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

const lignes = computed(() => {
  if (!esg.value) return [];
  return [
    { libelle: 'Ventes de marchandises', montant: esg.value.ventesMarchandises },
    { libelle: 'Achats de marchandises', montant: -esg.value.achatsMarchandises },
    { libelle: 'MARGE COMMERCIALE', montant: esg.value.margeCommerciale, total: true },
    { libelle: 'Production de l\'exercice', montant: esg.value.productionExercice },
    { libelle: 'Achats et services extérieurs', montant: -esg.value.achatsEtServicesExterieurs },
    { libelle: 'VALEUR AJOUTÉE', montant: esg.value.valeurAjoutee, total: true },
    { libelle: 'Charges de personnel', montant: -esg.value.chargesPersonnel },
    { libelle: 'Impôts et taxes', montant: -esg.value.impotsEtTaxes },
    { libelle: 'EXCÉDENT BRUT D\'EXPLOITATION', montant: esg.value.excedentBrutExploitation, total: true },
    { libelle: 'Reprises d\'exploitation', montant: esg.value.reprisesExploitation },
    { libelle: 'Dotations aux amortissements et provisions', montant: -esg.value.dotationsExploitation },
    { libelle: 'Autres produits d\'exploitation', montant: esg.value.autresProduitsExploitation },
    { libelle: 'RÉSULTAT D\'EXPLOITATION', montant: esg.value.resultatExploitation, total: true },
    { libelle: 'Produits financiers', montant: esg.value.produitsFinanciers },
    { libelle: 'Charges financières', montant: -esg.value.chargesFinancieres },
    { libelle: 'RÉSULTAT FINANCIER', montant: esg.value.resultatFinancier, total: true },
    { libelle: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES', montant: esg.value.resultatActivitesOrdinaires, total: true },
    { libelle: 'Produits HAO', montant: esg.value.produitsHAO },
    { libelle: 'Charges HAO', montant: -esg.value.chargesHAO },
    { libelle: 'RÉSULTAT HAO', montant: esg.value.resultatHAO, total: true },
    { libelle: 'Impôts sur le résultat', montant: -esg.value.impotResultat },
    { libelle: 'RÉSULTAT NET', montant: esg.value.resultatNet, total: true },
  ];
});

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    esg.value = await api.get(`/api/rapports/${activeSociete.value.id}/esg?exercice=${exercice.value}&dateDebut=${dateDebut.value}&dateFin=${dateFin.value}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function exporter() {
  if (!esg.value) return;
  exportCsv(`esg_${activeSociete.value.id}_${dateDebut.value}_${dateFin.value}.csv`, lignes.value, [
    { label: 'Solde de gestion', key: 'libelle' },
    { label: 'Montant', key: 'montant' },
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
    <h1>État des Soldes de Gestion {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

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
        <button class="btn secondary" :disabled="!esg" @click="exporter">Exporter CSV</button>
      </div>
      <p class="muted">Cascade SYSCOHADA des soldes intermédiaires de gestion, calculée à partir du plan comptable de cette application (pas de production stockée/immobilisée ni de variation de stock distincte : ces lignes restent nulles).</p>
    </div>

    <p v-if="loading" class="muted">Chargement...</p>

    <div class="card" v-if="esg">
      <table class="table-cards">
        <tbody>
          <tr v-for="(l, i) in lignes" :key="i" :style="l.total ? 'font-weight: 600;' : ''">
            <td data-label="Solde de gestion">{{ l.libelle }}</td>
            <td class="num" data-label="Montant">{{ l.montant.toLocaleString('fr-FR') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
