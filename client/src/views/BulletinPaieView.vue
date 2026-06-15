<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const route = useRoute();
const router = useRouter();
const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const fiche = ref(null);
const employe = ref(null);
const societe = ref(null);
const error = ref('');
const loading = ref(false);

const STATUTS = {
  brouillon: 'Brouillon',
  validee: 'Validée',
  payee: 'Payée',
};

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    const res = await api.get(`/api/paie/${activeSociete.value.id}/${route.params.id}`);
    fiche.value = res.fiche;
    employe.value = res.employe;
    societe.value = res.societe;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function imprimer() {
  window.print();
}

onMounted(load);
</script>

<template>
  <div class="bulletin-page">
    <div v-if="error" class="error">{{ error }}</div>
    <p v-else-if="loading" class="muted">Chargement...</p>

    <template v-else-if="fiche">
      <div class="actions no-print">
        <button class="btn secondary" @click="router.back()">Retour</button>
        <button class="btn" @click="imprimer">Imprimer</button>
      </div>

      <div class="bulletin card">
        <div class="bulletin-header">
          <div>
            <h1>{{ societe?.nom || '—' }}</h1>
            <p class="muted">Bulletin de paie</p>
          </div>
          <div class="text-right">
            <p><strong>Période :</strong> {{ fiche.periode }}</p>
            <p><strong>Statut :</strong> {{ STATUTS[fiche.statut] || fiche.statut }}</p>
          </div>
        </div>

        <div class="bulletin-employe">
          <p><strong>Employé :</strong> {{ fiche.employeNom }}</p>
          <p v-if="employe?.poste"><strong>Poste :</strong> {{ employe.poste }}</p>
        </div>

        <table class="table-cards">
          <thead>
            <tr>
              <th>Désignation</th>
              <th class="num">Heures</th>
              <th class="num">Taux horaire</th>
              <th class="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Désignation">Salaire de base</td>
              <td class="num" data-label="Heures">{{ fiche.heures }}</td>
              <td class="num" data-label="Taux horaire">{{ fiche.tauxHoraire.toLocaleString('fr-FR') }}</td>
              <td class="num" data-label="Montant">{{ fiche.salaire.toLocaleString('fr-FR') }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3"><strong>Net à payer</strong></td>
              <td class="num" data-label="Montant"><strong>{{ fiche.salaire.toLocaleString('fr-FR') }} {{ societe?.devise || '' }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.bulletin {
  max-width: 700px;
  margin: 0 auto;
}

.bulletin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
}

.bulletin-header h1 {
  margin: 0;
  font-size: 1.3rem;
}

.bulletin-employe {
  margin-bottom: 1rem;
}

tfoot td {
  background: #eef2f6;
}

@media print {
  .no-print {
    display: none;
  }
}
</style>
