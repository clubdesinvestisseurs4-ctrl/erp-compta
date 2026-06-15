<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const journaux = ref([]);
const error = ref('');
const success = ref('');
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    journaux.value = await api.get(`/api/journaux/${activeSociete.value.id}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function seed() {
  if (!activeSociete.value) return;
  error.value = '';
  success.value = '';
  try {
    const res = await api.post(`/api/journaux/${activeSociete.value.id}/seed`);
    success.value = `Journaux créés (${res.count}).`;
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
</script>

<template>
  <div>
    <h1>Journaux {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card" v-if="!loading && journaux.length === 0">
      <p>Aucun journal. Initialiser les journaux standards (AC, VE, BQ, CA, OD, AN) ?</p>
      <button class="btn" @click="seed">Initialiser les journaux</button>
    </div>

    <div class="card" v-if="journaux.length">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Libellé</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in journaux" :key="j.code">
            <td>{{ j.code }}</td>
            <td>{{ j.libelle }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
