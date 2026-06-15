<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const type = ref('client');
const tiersList = ref([]);
const error = ref('');
const success = ref('');
const saving = ref(false);

const form = ref({ nom: '', telephone: '', email: '', adresse: '' });

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  try {
    tiersList.value = await api.get(`/api/tiers/${activeSociete.value.id}?type=${type.value}`);
  } catch (err) {
    error.value = err.message;
  }
}

async function ajouter() {
  error.value = '';
  success.value = '';
  if (!form.value.nom) {
    error.value = 'Le nom est requis.';
    return;
  }

  saving.value = true;
  try {
    const res = await api.post(`/api/tiers/${activeSociete.value.id}`, { type: type.value, ...form.value });
    success.value = `${type.value === 'client' ? 'Client' : 'Fournisseur'} créé (compte ${res.compteNumero}).`;
    form.value = { nom: '', telephone: '', email: '', adresse: '' };
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function supprimer(tiers) {
  if (!confirm(`Supprimer ${tiers.nom} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/tiers/${activeSociete.value.id}/${tiers.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
watch(type, load);
</script>

<template>
  <div>
    <h1>Tiers {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          <input type="radio" value="client" v-model="type" /> Clients
        </label>
        <label>
          <input type="radio" value="fournisseur" v-model="type" /> Fournisseurs
        </label>
      </div>
    </div>

    <div class="card">
      <h2>Nouveau {{ type === 'client' ? 'client' : 'fournisseur' }}</h2>
      <div class="form-row">
        <label>
          Nom
          <input v-model="form.nom" type="text" />
        </label>
        <label>
          Téléphone
          <input v-model="form.telephone" type="text" />
        </label>
        <label>
          Email
          <input v-model="form.email" type="email" />
        </label>
        <label>
          Adresse
          <input v-model="form.adresse" type="text" />
        </label>
        <button class="btn" :disabled="saving" @click="ajouter">Ajouter</button>
      </div>
    </div>

    <div class="card">
      <table v-if="tiersList.length" class="table-cards">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Nom</th>
            <th>Téléphone</th>
            <th>Email</th>
            <th>Adresse</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tiersList" :key="t.id">
            <td data-label="Compte">{{ t.compteNumero }}</td>
            <td data-label="Nom">{{ t.nom }}</td>
            <td data-label="Téléphone">{{ t.telephone }}</td>
            <td data-label="Email">{{ t.email }}</td>
            <td data-label="Adresse">{{ t.adresse }}</td>
            <td data-label=""><button class="btn danger" @click="supprimer(t)">Supprimer</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun {{ type === 'client' ? 'client' : 'fournisseur' }}.</p>
    </div>
  </div>
</template>
