<script setup>
import { ref, onMounted } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const error = ref('');
const success = ref('');
const seeding = ref('');

onMounted(() => {
  societeStore.fetchSocietes();
});

async function seedSocietes() {
  error.value = '';
  success.value = '';
  seeding.value = 'societes';
  try {
    await api.post('/api/societes/seed');
    success.value = 'Sociétés créées (Ohinéné, Cook Africa).';
    await societeStore.fetchSocietes();
  } catch (err) {
    error.value = err.message;
  } finally {
    seeding.value = '';
  }
}

async function seedPlanComptable(societeId) {
  error.value = '';
  success.value = '';
  seeding.value = `plan-${societeId}`;
  try {
    const res = await api.post(`/api/comptes/${societeId}/seed`);
    success.value = `Plan comptable SYSCOHADA initialisé pour ${societeId} (${res.count} comptes).`;
  } catch (err) {
    error.value = err.message;
  } finally {
    seeding.value = '';
  }
}

async function seedJournaux(societeId) {
  error.value = '';
  success.value = '';
  seeding.value = `journaux-${societeId}`;
  try {
    const res = await api.post(`/api/journaux/${societeId}/seed`);
    success.value = `Journaux créés pour ${societeId} (${res.count}).`;
  } catch (err) {
    error.value = err.message;
  } finally {
    seeding.value = '';
  }
}

async function updateSociete(societe) {
  error.value = '';
  success.value = '';
  try {
    await api.put(`/api/societes/${societe.id}`, {
      nom: societe.nom,
      sigle: societe.sigle,
      devise: societe.devise,
      exerciceCourant: Number(societe.exerciceCourant),
    });
    success.value = `Société ${societe.nom} mise à jour.`;
    await societeStore.fetchSocietes();
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <div>
    <h1>Sociétés</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card" v-if="societeStore.societes.length === 0">
      <p>Aucune société initialisée.</p>
      <button class="btn" :disabled="seeding === 'societes'" @click="seedSocietes">
        Initialiser Ohinéné &amp; Cook Africa
      </button>
    </div>

    <div class="card" v-for="societe in societeStore.societes" :key="societe.id">
      <h2>{{ societe.nom }} ({{ societe.id }})</h2>

      <div class="form-row">
        <label>
          Nom
          <input v-model="societe.nom" type="text" />
        </label>
        <label>
          Sigle
          <input v-model="societe.sigle" type="text" />
        </label>
        <label>
          Devise
          <input v-model="societe.devise" type="text" />
        </label>
        <label>
          Exercice courant
          <input v-model="societe.exerciceCourant" type="number" />
        </label>
        <button class="btn" @click="updateSociete(societe)">Enregistrer</button>
      </div>

      <div class="form-row">
        <button class="btn secondary" :disabled="seeding === `plan-${societe.id}`" @click="seedPlanComptable(societe.id)">
          Initialiser le plan comptable SYSCOHADA
        </button>
        <button class="btn secondary" :disabled="seeding === `journaux-${societe.id}`" @click="seedJournaux(societe.id)">
          Initialiser les journaux
        </button>
      </div>
    </div>
  </div>
</template>
