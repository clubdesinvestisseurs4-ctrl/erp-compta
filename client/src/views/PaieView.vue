<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const periodeCourante = new Date().toISOString().slice(0, 7);

const fiches = ref([]);
const periode = ref(periodeCourante);
const error = ref('');
const success = ref('');
const loading = ref(false);
const compteTresorerie = ref('521');

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    fiches.value = await api.get(`/api/paie/${activeSociete.value.id}?periode=${periode.value}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function generer() {
  if (!activeSociete.value) return;
  error.value = '';
  success.value = '';
  try {
    const res = await api.post(`/api/paie/${activeSociete.value.id}/generer`, { periode: periode.value });
    success.value = res.message;
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function valider(fiche) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/paie/${activeSociete.value.id}/${fiche.id}/valider`);
    success.value = 'Fiche validée et comptabilisée.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function payer(fiche) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/paie/${activeSociete.value.id}/${fiche.id}/payer`, { compteTresorerie: compteTresorerie.value });
    success.value = 'Paiement comptabilisé.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function supprimer(fiche) {
  if (!confirm(`Supprimer la fiche de paie de ${fiche.employeNom} pour ${fiche.periode} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/paie/${activeSociete.value.id}/${fiche.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
watch(periode, load);
</script>

<template>
  <div>
    <h1>Paie {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Période
          <input v-model="periode" type="month" />
        </label>
        <button class="btn" @click="generer">Générer les fiches de paie</button>
        <label>
          Compte trésorerie pour le paiement
          <select v-model="compteTresorerie">
            <option value="521">521 — Banques</option>
            <option value="571">571 — Caisse</option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="fiches.length">
        <thead>
          <tr>
            <th>Employé</th>
            <th class="num">Heures</th>
            <th class="num">Taux horaire</th>
            <th class="num">Salaire</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in fiches" :key="f.id">
            <td>{{ f.employeNom }}</td>
            <td class="num">{{ f.heures }}</td>
            <td class="num">{{ f.tauxHoraire.toLocaleString('fr-FR') }}</td>
            <td class="num">{{ f.salaire.toLocaleString('fr-FR') }}</td>
            <td>{{ f.statut }}</td>
            <td>
              <RouterLink class="btn secondary" :to="`/paie/${f.id}/bulletin`">Bulletin</RouterLink>
              <button v-if="f.statut === 'brouillon'" class="btn" @click="valider(f)">Valider</button>
              <button v-if="f.statut === 'validee'" class="btn" @click="payer(f)">Marquer payée</button>
              <button v-if="f.statut === 'brouillon'" class="btn danger" @click="supprimer(f)">Supprimer</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucune fiche de paie pour cette période.</p>
    </div>
  </div>
</template>
