<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const periodeCourante = new Date().toISOString().slice(0, 7);

const pointages = ref([]);
const error = ref('');
const periode = ref(periodeCourante);

const totauxParEmploye = computed(() => {
  const totaux = new Map();
  for (const p of pointages.value) {
    const cumul = totaux.get(p.employeId) || { nom: p.employeNom, heures: 0 };
    cumul.heures += p.heures || 0;
    totaux.set(p.employeId, cumul);
  }
  return [...totaux.entries()].map(([employeId, t]) => ({ employeId, nom: t.nom, heures: Math.round(t.heures * 100) / 100 }));
});

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  try {
    pointages.value = await api.get(`/api/pointages/${activeSociete.value.id}?periode=${periode.value}`);
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, load, { immediate: true });
watch(periode, load);
</script>

<template>
  <div>
    <h1>Pointages {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <p class="muted">
      Pointages réels enregistrés via le scan QR dans l'application Gestion Employés (lecture seule).
    </p>

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
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pointages" :key="p.id">
            <td data-label="Date">{{ p.date }}</td>
            <td data-label="Employé">{{ p.employeNom }}</td>
            <td data-label="Arrivée">{{ p.heureArrivee || '—' }}</td>
            <td data-label="Départ">{{ p.heureDepart || '—' }}</td>
            <td class="num" data-label="Heures">{{ p.heures ?? '—' }}</td>
            <td data-label="Statut">{{ p.statutJour }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun pointage pour cette période.</p>
    </div>
  </div>
</template>
