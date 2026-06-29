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
          <p v-if="fiche.matricule"><strong>Matricule :</strong> {{ fiche.matricule }}</p>
          <p v-if="fiche.poste"><strong>Poste :</strong> {{ fiche.poste }}</p>
        </div>

        <table class="table-cards">
          <thead>
            <tr>
              <th>Désignation</th>
              <th class="num">Heures</th>
              <th class="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Désignation">Heures pointées</td>
              <td class="num" data-label="Heures">{{ fiche.heuresPointees }}</td>
              <td class="num" data-label="Montant"></td>
            </tr>
            <tr>
              <td data-label="Désignation">Congés / permissions payés</td>
              <td class="num" data-label="Heures">{{ fiche.heuresCongesPayees }}</td>
              <td class="num" data-label="Montant"></td>
            </tr>
            <tr>
              <td data-label="Désignation">Salaire brut ({{ fiche.totalHeures }} / {{ fiche.heuresAttenduesMois }} h, base {{ fiche.salaireMensuelBase.toLocaleString('fr-FR') }})</td>
              <td class="num" data-label="Heures"></td>
              <td class="num" data-label="Montant">{{ fiche.salaireBrutCalcule.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr v-if="fiche.avanceDeduite > 0">
              <td data-label="Désignation">Avance sur salaire déduite</td>
              <td class="num" data-label="Heures"></td>
              <td class="num" data-label="Montant">-{{ fiche.avanceDeduite.toLocaleString('fr-FR') }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2"><strong>Net à payer</strong></td>
              <td class="num" data-label="Montant"><strong>{{ fiche.salaireNet.toLocaleString('fr-FR') }} {{ societe?.devise || '' }}</strong></td>
            </tr>
          </tfoot>
        </table>
        <p class="muted" style="margin-top:8px">
          Le montant comptabilisé (charge et trésorerie) est le salaire brut ; l'avance déduite est une
          information RH, son remboursement n'est pas isolé dans une écriture séparée.
        </p>
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
