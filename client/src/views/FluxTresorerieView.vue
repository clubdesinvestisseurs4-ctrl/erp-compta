<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const exercice = ref(null);
const flux = ref(null);
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    flux.value = await api.get(`/api/rapports/${activeSociete.value.id}/flux-tresorerie?exercice=${exercice.value}`);
  } catch (err) {
    toast.error(err.message);
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
    <h1>Flux de trésorerie {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <div class="form-row">
        <label>
          Exercice
          <input v-model.number="exercice" type="number" @change="load" />
        </label>
      </div>
      <p class="muted">
        Tableau simplifié (méthode indirecte), inspiré du TAFIRE SYSCOHADA mais pas équivalent au
        TAFIRE normalisé complet — à valider avec votre expert-comptable avant toute utilisation
        officielle. Compare l'exercice sélectionné à l'exercice précédent ({{ exercice ? exercice - 1 : '' }}).
      </p>
    </div>

    <p v-if="loading" class="muted">Chargement...</p>

    <div class="card" v-if="flux">
      <table class="table-cards">
        <tbody>
          <tr>
            <td data-label="Ligne">Résultat net</td>
            <td class="num" data-label="Montant">{{ flux.resultatNet.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr>
            <td data-label="Ligne">+ Dotations aux amortissements et provisions</td>
            <td class="num" data-label="Montant">{{ flux.dotationsExploitation.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr>
            <td data-label="Ligne">− Reprises d'exploitation</td>
            <td class="num" data-label="Montant">{{ (-flux.reprisesExploitation).toLocaleString('fr-FR') }}</td>
          </tr>
          <tr style="font-weight: 600;">
            <td data-label="Ligne">= CAPACITÉ D'AUTOFINANCEMENT GLOBALE (CAFG)</td>
            <td class="num" data-label="Montant">{{ flux.cafg.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr>
            <td data-label="Ligne">− Variation du besoin en fonds de roulement</td>
            <td class="num" data-label="Montant">{{ (-flux.variationBfr).toLocaleString('fr-FR') }}</td>
          </tr>
          <tr style="font-weight: 600;">
            <td data-label="Ligne">= FLUX DE TRÉSORERIE D'EXPLOITATION</td>
            <td class="num" data-label="Montant">{{ flux.fluxExploitation.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr style="font-weight: 600;">
            <td data-label="Ligne">FLUX DE TRÉSORERIE D'INVESTISSEMENT</td>
            <td class="num" data-label="Montant">{{ flux.fluxInvestissement.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr style="font-weight: 600;">
            <td data-label="Ligne">FLUX DE TRÉSORERIE DE FINANCEMENT</td>
            <td class="num" data-label="Montant">{{ flux.fluxFinancement.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr style="font-weight: 600;">
            <td data-label="Ligne">= VARIATION DE TRÉSORERIE (calculée)</td>
            <td class="num" data-label="Montant">{{ flux.variationTresorerieCalculee.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr>
            <td data-label="Ligne">Variation de trésorerie (constatée au bilan)</td>
            <td class="num" data-label="Montant">{{ flux.variationTresorerieBilan.toLocaleString('fr-FR') }}</td>
          </tr>
          <tr>
            <td data-label="Ligne">Écart de contrôle</td>
            <td class="num" data-label="Montant" :class="flux.ecartControle === 0 ? 'success' : 'error'">
              {{ flux.ecartControle.toLocaleString('fr-FR') }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="flux.ecartControle !== 0" class="error mt-1">
        L'écart de contrôle n'est pas nul : des mouvements (ex. cessions d'immobilisations, comptes hors classes 1-7) ne sont peut-être pas pris en compte dans ce tableau simplifié.
      </p>
    </div>
  </div>
</template>
