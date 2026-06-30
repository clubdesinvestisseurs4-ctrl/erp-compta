<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const journaux = ref([]);
const loading = ref(false);

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    journaux.value = await api.get(`/api/journaux/${activeSociete.value.id}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function seed() {
  if (!activeSociete.value) return;
  try {
    const res = await api.post(`/api/journaux/${activeSociete.value.id}/seed`);
    toast.success(`Journaux créés (${res.count}).`);
    await load();
  } catch (err) {
    toast.error(err.message);
  }
}

watch(activeSociete, load, { immediate: true });
</script>

<template>
  <div>
    <h1>Journaux {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card" v-if="!loading && journaux.length === 0">
      <p>Aucun journal. Initialiser les journaux standards (AC, VE, BQ, CA, OD, AN) ?</p>
      <button class="btn" @click="seed">Initialiser les journaux</button>
    </div>

    <div class="card" v-if="journaux.length">
      <table class="table-cards">
        <thead>
          <tr>
            <th>Code</th>
            <th>Libellé</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in journaux" :key="j.code">
            <td data-label="Code">{{ j.code }}</td>
            <td data-label="Libellé">{{ j.libelle }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
