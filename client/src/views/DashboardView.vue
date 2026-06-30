<script setup>
import { computed, ref, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const resultat = ref(null);
const loading = ref(false);

async function loadResultat() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    resultat.value = await api.get(`/api/rapports/${activeSociete.value.id}/resultat?exercice=${activeSociete.value.exerciceCourant}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

watch(activeSociete, loadResultat, { immediate: true });
</script>

<template>
  <div>
    <h1>Tableau de bord</h1>

    <div v-if="!activeSociete" class="card">
      Chargement des sociétés...
    </div>

    <template v-else>
      <div class="card">
        <h2>{{ activeSociete.nom }}</h2>
        <p class="muted">
          Exercice {{ activeSociete.exerciceCourant }} — Devise {{ activeSociete.devise }}
        </p>
      </div>

      <div v-if="loading" class="card">Chargement...</div>

      <div v-else-if="resultat" class="card">
        <h2>Compte de résultat (synthèse)</h2>
        <table>
          <tbody>
            <tr>
              <td>Total des produits</td>
              <td class="num">{{ resultat.totalProduits.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td>Total des charges</td>
              <td class="num">{{ resultat.totalCharges.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td><strong>Résultat net</strong></td>
              <td class="num"><strong>{{ resultat.resultatNet.toLocaleString('fr-FR') }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Accès rapides</h2>
        <p>
          <RouterLink to="/ecritures/nouvelle" class="btn">Nouvelle écriture</RouterLink>
        </p>
        <p class="muted">
          Plan comptable, journaux, grand livre, balance et bilan/résultat sont accessibles depuis le menu en haut de page.
        </p>
      </div>
    </template>
  </div>
</template>
