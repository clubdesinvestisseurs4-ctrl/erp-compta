<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const comptes = ref([]);
const error = ref('');
const success = ref('');
const loading = ref(false);
const search = ref('');

const nouveauCompte = ref({ numero: '', libelle: '', classe: 6 });

const comptesFiltres = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return comptes.value;
  return comptes.value.filter(c =>
    c.numero.includes(term) || c.libelle.toLowerCase().includes(term)
  );
});

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    comptes.value = await api.get(`/api/comptes/${activeSociete.value.id}`);
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
    const res = await api.post(`/api/comptes/${activeSociete.value.id}/seed`);
    success.value = `Plan comptable SYSCOHADA initialisé (${res.count} comptes).`;
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function ajouterCompte() {
  if (!activeSociete.value) return;
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/comptes/${activeSociete.value.id}`, {
      numero: nouveauCompte.value.numero.trim(),
      libelle: nouveauCompte.value.libelle.trim(),
      classe: Number(nouveauCompte.value.classe),
    });
    success.value = `Compte ${nouveauCompte.value.numero} créé.`;
    nouveauCompte.value = { numero: '', libelle: '', classe: 6 };
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
</script>

<template>
  <div>
    <h1>Plan comptable {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card" v-if="!loading && comptes.length === 0">
      <p>Aucun compte. Initialiser le référentiel SYSCOHADA pour cette société ?</p>
      <button class="btn" @click="seed">Initialiser le plan comptable SYSCOHADA</button>
    </div>

    <div class="card">
      <h2>Ajouter un compte</h2>
      <div class="form-row">
        <label>
          Numéro
          <input v-model="nouveauCompte.numero" type="text" placeholder="ex: 6285" />
        </label>
        <label>
          Libellé
          <input v-model="nouveauCompte.libelle" type="text" placeholder="ex: Frais internet" />
        </label>
        <label>
          Classe
          <select v-model="nouveauCompte.classe">
            <option v-for="n in 8" :key="n" :value="n">Classe {{ n }}</option>
          </select>
        </label>
        <button class="btn" @click="ajouterCompte" :disabled="!nouveauCompte.numero || !nouveauCompte.libelle">
          Ajouter
        </button>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <label>
          Rechercher
          <input v-model="search" type="text" placeholder="numéro ou libellé" />
        </label>
      </div>

      <table v-if="comptesFiltres.length">
        <thead>
          <tr>
            <th>Numéro</th>
            <th>Libellé</th>
            <th>Classe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comptesFiltres" :key="c.numero">
            <td>{{ c.numero }}</td>
            <td>{{ c.libelle }}</td>
            <td>{{ c.classe }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun compte trouvé.</p>
    </div>
  </div>
</template>
