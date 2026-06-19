<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const exercice = ref(null);
const apercu = ref(null);
const error = ref('');
const success = ref('');
const simulating = ref(false);
const executing = ref(false);

function reset() {
  apercu.value = null;
  error.value = '';
  success.value = '';
}

async function simuler() {
  if (!activeSociete.value || !exercice.value) return;
  error.value = '';
  success.value = '';
  apercu.value = null;
  simulating.value = true;
  try {
    apercu.value = await api.get(`/api/cloture/${activeSociete.value.id}/simuler?exercice=${exercice.value}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    simulating.value = false;
  }
}

async function confirmer() {
  if (!apercu.value) return;
  if (!confirm(`Clôturer définitivement l'exercice ${apercu.value.exercice} ? Cette action est irréversible : elle génère l'écriture de résultat et les à-nouveaux ${apercu.value.exerciceSuivant}, puis verrouille l'exercice ${apercu.value.exercice}.`)) return;

  error.value = '';
  success.value = '';
  executing.value = true;
  try {
    const res = await api.post(`/api/cloture/${activeSociete.value.id}/executer`, { exercice: apercu.value.exercice });
    success.value = `Exercice ${res.exercice} clôturé. Résultat net : ${res.resultatNet.toLocaleString('fr-FR')} (compte ${res.compteResultat || '—'}).`;
    apercu.value = null;
    await societeStore.fetchSocietes();
  } catch (err) {
    error.value = err.message;
  } finally {
    executing.value = false;
  }
}

watch(activeSociete, () => {
  reset();
  exercice.value = activeSociete.value ? activeSociete.value.exerciceCourant : null;
}, { immediate: true });
</script>

<template>
  <div>
    <h1>Clôture d'exercice {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Exercice à clôturer
          <input v-model.number="exercice" type="number" @change="reset" />
        </label>
        <button class="btn" :disabled="simulating || !exercice" @click="simuler">
          {{ simulating ? 'Calcul...' : 'Simuler la clôture' }}
        </button>
      </div>
      <p class="muted">La simulation ne modifie rien. Seul le bouton « Confirmer la clôture » ci-dessous écrit réellement les écritures et verrouille l'exercice.</p>
    </div>

    <div v-if="apercu" class="card">
      <h2>Aperçu — exercice {{ apercu.exercice }}</h2>

      <div class="form-row">
        <span>Total charges : <strong>{{ apercu.totalCharges.toLocaleString('fr-FR') }}</strong></span>
        <span>Total produits : <strong>{{ apercu.totalProduits.toLocaleString('fr-FR') }}</strong></span>
        <span>Résultat net : <strong>{{ apercu.resultatNet.toLocaleString('fr-FR') }}</strong> ({{ apercu.compteResultat ? (apercu.compteResultat === '120' ? 'bénéfice, compte 120' : 'perte, compte 129') : 'nul' }})</span>
      </div>

      <h3>Écriture de détermination du résultat ({{ apercu.exercice }}-12-31, journal OD)</h3>
      <table v-if="apercu.lignesResultat.length" class="table-cards">
        <thead>
          <tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in apercu.lignesResultat" :key="i">
            <td data-label="Compte">{{ l.compte }}</td>
            <td data-label="Libellé">{{ l.libelle }}</td>
            <td class="num" data-label="Débit">{{ l.debit ? l.debit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Crédit">{{ l.credit ? l.credit.toLocaleString('fr-FR') : '' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun mouvement de charge/produit sur cet exercice : aucune écriture de résultat ne sera créée.</p>

      <h3>À-nouveaux ({{ apercu.exerciceSuivant }}-01-01, journal AN)</h3>
      <table v-if="apercu.lignesANouveaux.length" class="table-cards">
        <thead>
          <tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in apercu.lignesANouveaux" :key="i">
            <td data-label="Compte">{{ l.compte }}</td>
            <td data-label="Libellé">{{ l.libelle }}</td>
            <td class="num" data-label="Débit">{{ l.debit ? l.debit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Crédit">{{ l.credit ? l.credit.toLocaleString('fr-FR') : '' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            <th class="num">{{ apercu.totalANDebit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ apercu.totalANCredit.toLocaleString('fr-FR') }}</th>
          </tr>
        </tfoot>
      </table>
      <p v-else class="muted">Aucun solde de bilan à reporter sur cet exercice.</p>

      <div class="form-row mt-1">
        <button class="btn danger" :disabled="executing" @click="confirmer">
          {{ executing ? 'Clôture en cours...' : 'Confirmer la clôture (irréversible)' }}
        </button>
      </div>
    </div>
  </div>
</template>
