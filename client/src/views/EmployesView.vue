<script setup>
import { ref, onMounted } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();

const employes = ref([]);
const error = ref('');

async function load() {
  error.value = '';
  try {
    employes.value = await api.get('/api/employes');
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

    <p class="muted">
      Les employés sont créés et gérés dans l'application Gestion Employés — cette page n'en affiche
      que la liste, à titre de référentiel pour la paie et le pointage.
    </p>

    <div class="card">
      <table v-if="employes.length" class="table-cards">
        <thead>
          <tr>
            <th>Matricule</th>
            <th>Nom</th>
            <th>Poste</th>
            <th class="num">Salaire mensuel</th>
            <th>Établissements</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employes" :key="e.id">
            <td data-label="Matricule">{{ e.matricule }}</td>
            <td data-label="Nom">{{ e.prenom }} {{ e.nom }}</td>
            <td data-label="Poste">{{ e.poste }}</td>
            <td class="num" data-label="Salaire mensuel">{{ e.salaireMensuel?.toLocaleString('fr-FR') }}</td>
            <td data-label="Établissements">{{ e.etablissementsAccess.map(societeNom).join(', ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun employé.</p>
    </div>
  </div>
</template>
