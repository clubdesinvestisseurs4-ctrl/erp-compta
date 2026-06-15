<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const today = new Date().toISOString().slice(0, 10);
const periodeCourante = today.slice(0, 7);

const employes = ref([]);
const pointages = ref([]);
const error = ref('');
const success = ref('');
const saving = ref(false);
const periode = ref(periodeCourante);

const form = ref({
  employeId: '',
  date: today,
  heureArrivee: '',
  heureDepart: '',
});

const employesDisponibles = computed(() => {
  if (!activeSociete.value) return [];
  return employes.value.filter(e => (e.societesAccess || []).includes(activeSociete.value.id));
});

const totauxParEmploye = computed(() => {
  const totaux = new Map();
  for (const p of pointages.value) {
    totaux.set(p.employeId, (totaux.get(p.employeId) || 0) + p.heures);
  }
  return [...totaux.entries()].map(([employeId, heures]) => {
    const employe = employes.value.find(e => e.id === employeId);
    return { employeId, nom: employe ? `${employe.prenom} ${employe.nom}` : employeId, heures: Math.round(heures * 100) / 100 };
  });
});

async function loadEmployes() {
  employes.value = await api.get('/api/employes');
}

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  try {
    pointages.value = await api.get(`/api/pointages/${activeSociete.value.id}?periode=${periode.value}`);
  } catch (err) {
    error.value = err.message;
  }
}

async function ajouter() {
  error.value = '';
  success.value = '';
  if (!activeSociete.value) return;

  if (!form.value.employeId || !form.value.date || !form.value.heureArrivee || !form.value.heureDepart) {
    error.value = 'Tous les champs sont requis.';
    return;
  }

  saving.value = true;
  try {
    await api.post(`/api/pointages/${activeSociete.value.id}`, form.value);
    success.value = 'Pointage enregistré.';
    form.value.heureArrivee = '';
    form.value.heureDepart = '';
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function supprimer(pointage) {
  if (!confirm(`Supprimer le pointage du ${pointage.date} pour ${pointage.employeNom} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/pointages/${activeSociete.value.id}/${pointage.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, () => { loadEmployes(); load(); }, { immediate: true });
watch(periode, load);
</script>

<template>
  <div>
    <h1>Pointages {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <div class="card">
      <h2>Nouveau pointage</h2>
      <div class="form-row">
        <label>
          Employé
          <select v-model="form.employeId">
            <option value="" disabled>Choisir...</option>
            <option v-for="e in employesDisponibles" :key="e.id" :value="e.id">{{ e.prenom }} {{ e.nom }}</option>
          </select>
        </label>
        <label>
          Date
          <input v-model="form.date" type="date" />
        </label>
        <label>
          Heure d'arrivée
          <input v-model="form.heureArrivee" type="time" />
        </label>
        <label>
          Heure de départ
          <input v-model="form.heureDepart" type="time" />
        </label>
        <button class="btn" :disabled="saving" @click="ajouter">Enregistrer</button>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <label>
          Période
          <input v-model="periode" type="month" />
        </label>
      </div>

      <h2>Total des heures du mois</h2>
      <table v-if="totauxParEmploye.length" class="table-cards">
        <thead>
          <tr>
            <th>Employé</th>
            <th class="num">Heures</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in totauxParEmploye" :key="t.employeId">
            <td data-label="Employé">{{ t.nom }}</td>
            <td class="num" data-label="Heures">{{ t.heures }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun pointage pour cette période.</p>
    </div>

    <div class="card">
      <h2>Détail des pointages</h2>
      <table v-if="pointages.length" class="table-cards">
        <thead>
          <tr>
            <th>Date</th>
            <th>Employé</th>
            <th>Arrivée</th>
            <th>Départ</th>
            <th class="num">Heures</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pointages" :key="p.id">
            <td data-label="Date">{{ p.date }}</td>
            <td data-label="Employé">{{ p.employeNom }}</td>
            <td data-label="Arrivée">{{ p.heureArrivee }}</td>
            <td data-label="Départ">{{ p.heureDepart }}</td>
            <td class="num" data-label="Heures">{{ p.heures }}</td>
            <td data-label=""><button class="btn danger" @click="supprimer(p)">Supprimer</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun pointage pour cette période.</p>
    </div>
  </div>
</template>
