<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';
import { useConfirmStore } from '../stores/confirm';
import { useRefCacheStore } from '../stores/refCache';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();
const confirmStore = useConfirmStore();
const refCache = useRefCacheStore();

const type = ref('client');
const tiersList = ref([]);
const saving = ref(false);

const form = ref({ nom: '', telephone: '', email: '', adresse: '' });

async function load() {
  if (!activeSociete.value) return;
  try {
    const societeId = activeSociete.value.id;
    tiersList.value = await refCache.get(`tiers:${societeId}:${type.value}`, () => api.get(`/api/tiers/${societeId}?type=${type.value}`));
  } catch (err) {
    toast.error(err.message);
  }
}

async function ajouter() {
  if (!form.value.nom) {
    toast.error('Le nom est requis.');
    return;
  }

  saving.value = true;
  try {
    const societeId = activeSociete.value.id;
    const res = await api.post(`/api/tiers/${societeId}`, { type: type.value, ...form.value });
    toast.success(`${type.value === 'client' ? 'Client' : 'Fournisseur'} créé (compte ${res.compteNumero}).`);
    form.value = { nom: '', telephone: '', email: '', adresse: '' };
    // La création d'un tiers crée aussi son compte auxiliaire dans le plan comptable.
    refCache.invalidate(`tiers:${societeId}:${type.value}`);
    refCache.invalidate(`comptes:${societeId}`);
    await load();
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function supprimer(tiers) {
  if (!(await confirmStore.ask(`Supprimer ${tiers.nom} ?`, { danger: true, confirmLabel: 'Supprimer' }))) return;
  try {
    const societeId = activeSociete.value.id;
    await api.delete(`/api/tiers/${societeId}/${tiers.id}`);
    toast.success(`${tiers.nom} supprimé.`);
    refCache.invalidate(`tiers:${societeId}:${type.value}`);
    refCache.invalidate(`comptes:${societeId}`);
    await load();
  } catch (err) {
    toast.error(err.message);
  }
}

watch(activeSociete, () => load(), { immediate: true });
watch(type, () => load());
</script>

<template>
  <div>
    <h1>Tiers {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

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
