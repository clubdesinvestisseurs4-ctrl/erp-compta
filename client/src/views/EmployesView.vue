<script setup>
import { ref, onMounted } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();

const employes = ref([]);
const error = ref('');
const success = ref('');
const saving = ref(false);

const form = ref({
  nom: '',
  prenom: '',
  poste: '',
  tauxHoraire: '',
  societesAccess: [],
});

const editingId = ref(null);

async function load() {
  error.value = '';
  try {
    employes.value = await api.get('/api/employes');
  } catch (err) {
    error.value = err.message;
  }
}

function resetForm() {
  form.value = { nom: '', prenom: '', poste: '', tauxHoraire: '', societesAccess: [] };
  editingId.value = null;
}

function modifier(employe) {
  form.value = {
    nom: employe.nom,
    prenom: employe.prenom,
    poste: employe.poste || '',
    tauxHoraire: employe.tauxHoraire,
    societesAccess: [...employe.societesAccess],
  };
  editingId.value = employe.id;
  success.value = '';
  error.value = '';
}

async function enregistrer() {
  error.value = '';
  success.value = '';

  if (!form.value.nom || !form.value.prenom || !form.value.tauxHoraire || form.value.societesAccess.length === 0) {
    error.value = 'Nom, prénom, taux horaire et au moins une société sont requis.';
    return;
  }

  const payload = {
    nom: form.value.nom,
    prenom: form.value.prenom,
    poste: form.value.poste,
    tauxHoraire: Number(form.value.tauxHoraire),
    societesAccess: form.value.societesAccess,
  };

  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/api/employes/${editingId.value}`, payload);
      success.value = 'Employé mis à jour.';
    } else {
      await api.post('/api/employes', payload);
      success.value = 'Employé créé.';
    }
    resetForm();
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function supprimer(employe) {
  if (!confirm(`Désactiver l'employé ${employe.prenom} ${employe.nom} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/employes/${employe.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

function societeNom(id) {
  return societeStore.societes.find(s => s.id === id)?.nom || id;
}

onMounted(() => {
  load();
  if (societeStore.societes.length === 0) societeStore.fetchSocietes();
});
</script>

<template>
  <div>
    <h1>Personnel</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card">
      <h2>{{ editingId ? 'Modifier l\'employé' : 'Nouvel employé' }}</h2>
      <div class="form-row">
        <label>
          Nom
          <input v-model="form.nom" type="text" />
        </label>
        <label>
          Prénom
          <input v-model="form.prenom" type="text" />
        </label>
        <label>
          Poste
          <input v-model="form.poste" type="text" />
        </label>
        <label>
          Taux horaire
          <input v-model="form.tauxHoraire" type="number" min="0" step="0.01" />
        </label>
      </div>
      <div class="form-row">
        <label v-for="s in societeStore.societes" :key="s.id">
          <input type="checkbox" :value="s.id" v-model="form.societesAccess" />
          {{ s.nom }}
        </label>
      </div>
      <div class="form-row">
        <button class="btn" :disabled="saving" @click="enregistrer">{{ editingId ? 'Enregistrer' : 'Ajouter' }}</button>
        <button v-if="editingId" class="btn secondary" :disabled="saving" @click="resetForm">Annuler</button>
      </div>
    </div>

    <div class="card">
      <table v-if="employes.length">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Poste</th>
            <th class="num">Taux horaire</th>
            <th>Sociétés</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employes" :key="e.id">
            <td>{{ e.prenom }} {{ e.nom }}</td>
            <td>{{ e.poste }}</td>
            <td class="num">{{ e.tauxHoraire.toLocaleString('fr-FR') }}</td>
            <td>{{ e.societesAccess.map(societeNom).join(', ') }}</td>
            <td>
              <button class="btn secondary" @click="modifier(e)">Modifier</button>
              <button class="btn danger" @click="supprimer(e)">Désactiver</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun employé.</p>
    </div>
  </div>
</template>
