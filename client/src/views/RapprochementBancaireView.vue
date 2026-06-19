<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const today = new Date().toISOString().slice(0, 10);

const compte = ref('521');
const dateFin = ref(today);
const mouvements = ref([]);
const soldeComptable = ref(0);
const soldeNonPointe = ref(0);
const soldeTheoriqueReleve = ref(0);
const soldeReleve = ref('');
const error = ref('');
const loading = ref(false);

const ecart = computed(() => {
  if (soldeReleve.value === '') return null;
  return round2(soldeTheoriqueReleve.value - Number(soldeReleve.value));
});

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function load() {
  if (!activeSociete.value || !compte.value) return;
  error.value = '';
  loading.value = true;
  try {
    const res = await api.get(`/api/rapprochement/${activeSociete.value.id}/${compte.value}?dateFin=${dateFin.value}`);
    mouvements.value = res.mouvements;
    soldeComptable.value = res.soldeComptable;
    soldeNonPointe.value = res.soldeNonPointe;
    soldeTheoriqueReleve.value = res.soldeTheoriqueReleve;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function togglePointage(m) {
  error.value = '';
  try {
    await api.post(`/api/rapprochement/${activeSociete.value.id}/${compte.value}/pointer`, {
      ecritureId: m.ecritureId,
      ligneIndex: m.ligneIndex,
      pointe: !m.pointe,
    });
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
</script>

<template>
  <div>
    <h1>Rapprochement bancaire {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Compte
          <select v-model="compte" @change="load">
            <option value="521">521 — Banques</option>
            <option value="571">571 — Caisse</option>
          </select>
        </label>
        <label>
          Jusqu'au
          <input v-model="dateFin" type="date" @change="load" />
        </label>
        <button class="btn" @click="load">Charger</button>
        <label>
          Solde réel du relevé bancaire
          <input v-model="soldeReleve" type="number" step="0.01" placeholder="à saisir depuis votre relevé" />
        </label>
      </div>

      <div class="form-row">
        <span>Solde comptable : <strong>{{ soldeComptable.toLocaleString('fr-FR') }}</strong></span>
        <span>− Mouvements non pointés : <strong>{{ soldeNonPointe.toLocaleString('fr-FR') }}</strong></span>
        <span>= Solde théorique du relevé : <strong>{{ soldeTheoriqueReleve.toLocaleString('fr-FR') }}</strong></span>
        <span v-if="ecart !== null" :class="ecart === 0 ? 'success' : 'error'" style="margin: 0;">
          Écart : {{ ecart.toLocaleString('fr-FR') }} {{ ecart === 0 ? '(rapprochement OK)' : '' }}
        </span>
      </div>
    </div>

    <div class="card">
      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="mouvements.length" class="table-cards">
        <thead>
          <tr>
            <th>Pointé</th>
            <th>Date</th>
            <th>Journal</th>
            <th>N°</th>
            <th>Libellé</th>
            <th class="num">Débit</th>
            <th class="num">Crédit</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in mouvements" :key="`${m.ecritureId}_${m.ligneIndex}`">
            <td><input type="checkbox" :checked="m.pointe" @change="togglePointage(m)" /></td>
            <td data-label="Date">{{ m.date }}</td>
            <td data-label="Journal">{{ m.journalCode }}</td>
            <td data-label="N°">{{ m.numero }}</td>
            <td data-label="Libellé">{{ m.libelle }}</td>
            <td class="num" data-label="Débit">{{ m.debit ? m.debit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Crédit">{{ m.credit ? m.credit.toLocaleString('fr-FR') : '' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun mouvement sur ce compte.</p>
    </div>
  </div>
</template>
