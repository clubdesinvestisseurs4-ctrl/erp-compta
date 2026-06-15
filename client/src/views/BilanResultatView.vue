<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const exercice = ref(null);
const bilan = ref(null);
const resultat = ref(null);
const error = ref('');
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    [bilan.value, resultat.value] = await Promise.all([
      api.get(`/api/rapports/${activeSociete.value.id}/bilan?exercice=${exercice.value}`),
      api.get(`/api/rapports/${activeSociete.value.id}/resultat?exercice=${exercice.value}`),
    ]);
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
    <h1>Bilan / Compte de résultat {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Exercice
          <input v-model.number="exercice" type="number" @change="load" />
        </label>
      </div>
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
            <table>
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in bilan.actif" :key="l.numero">
                  <td>{{ l.numero }}</td><td>{{ l.libelle }}</td><td class="num">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Actif</th><th class="num">{{ bilan.totalActif.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
          <div style="flex: 1; min-width: 280px;">
            <h3>Passif</h3>
            <table>
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in bilan.passif" :key="l.numero">
                  <td>{{ l.numero }}</td><td>{{ l.libelle }}</td><td class="num">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Passif</th><th class="num">{{ bilan.totalPassif.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Compte de résultat</h2>
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <h3>Charges</h3>
            <table>
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in resultat.charges" :key="l.numero">
                  <td>{{ l.numero }}</td><td>{{ l.libelle }}</td><td class="num">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Charges</th><th class="num">{{ resultat.totalCharges.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
          <div style="flex: 1; min-width: 280px;">
            <h3>Produits</h3>
            <table>
              <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Montant</th></tr></thead>
              <tbody>
                <tr v-for="l in resultat.produits" :key="l.numero">
                  <td>{{ l.numero }}</td><td>{{ l.libelle }}</td><td class="num">{{ l.montant.toLocaleString('fr-FR') }}</td>
                </tr>
              </tbody>
              <tfoot><tr><th colspan="2">Total Produits</th><th class="num">{{ resultat.totalProduits.toLocaleString('fr-FR') }}</th></tr></tfoot>
            </table>
          </div>
        </div>
        <p class="mt-1"><strong>Résultat net : {{ resultat.resultatNet.toLocaleString('fr-FR') }}</strong></p>
      </div>
    </template>
  </div>
</template>
