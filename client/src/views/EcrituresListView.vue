<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const journaux = ref([]);
const ecritures = ref([]);
const error = ref('');
const loading = ref(false);
const expanded = ref(new Set());

const filtreJournal = ref('');
const filtreExercice = ref(null);

async function loadJournaux() {
  if (!activeSociete.value) return;
  journaux.value = await api.get(`/api/journaux/${activeSociete.value.id}`);
}

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filtreJournal.value) params.set('journal', filtreJournal.value);
    params.set('exercice', filtreExercice.value);
    ecritures.value = await api.get(`/api/ecritures/${activeSociete.value.id}?${params.toString()}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function toggle(id) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id);
  } else {
    expanded.value.add(id);
  }
  expanded.value = new Set(expanded.value);
}

async function supprimer(ecriture) {
  if (!confirm(`Supprimer l'écriture ${ecriture.journalCode}-${ecriture.numero} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/ecritures/${activeSociete.value.id}/${ecriture.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, () => {
  if (activeSociete.value) {
    filtreExercice.value = activeSociete.value.exerciceCourant;
  }
  loadJournaux();
  load();
}, { immediate: true });
</script>

<template>
  <div>
    <h1>Écritures {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="form-row">
        <label>
          Journal
          <select v-model="filtreJournal" @change="load">
            <option value="">Tous</option>
            <option v-for="j in journaux" :key="j.code" :value="j.code">{{ j.code }} — {{ j.libelle }}</option>
          </select>
        </label>
        <label>
          Exercice
          <input v-model.number="filtreExercice" type="number" @change="load" />
        </label>
        <RouterLink to="/ecritures/nouvelle" class="btn">+ Nouvelle écriture</RouterLink>
      </div>
    </div>

    <div class="card">
      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="ecritures.length" class="table-cards">
        <thead>
          <tr>
            <th>Date</th>
            <th>Journal</th>
            <th>N°</th>
            <th>Libellé</th>
            <th class="num">Débit</th>
            <th class="num">Crédit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="ec in ecritures" :key="ec.id">
            <tr style="cursor: pointer;" @click="toggle(ec.id)">
              <td data-label="Date">{{ ec.date }}</td>
              <td data-label="Journal">{{ ec.journalCode }}</td>
              <td data-label="N°">{{ ec.numero }}</td>
              <td data-label="Libellé">{{ ec.libelle }}</td>
              <td class="num" data-label="Débit">{{ ec.totalDebit.toLocaleString('fr-FR') }}</td>
              <td class="num" data-label="Crédit">{{ ec.totalCredit.toLocaleString('fr-FR') }}</td>
              <td><button class="btn danger" @click.stop="supprimer(ec)">Supprimer</button></td>
            </tr>
            <tr v-if="expanded.has(ec.id)">
              <td colspan="7" style="background: #f9fafb;">
                <table class="table-cards">
                  <thead>
                    <tr>
                      <th>Compte</th>
                      <th>Libellé</th>
                      <th class="num">Débit</th>
                      <th class="num">Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(l, i) in ec.lignes" :key="i">
                      <td data-label="Compte">{{ l.compte }}</td>
                      <td data-label="Libellé">{{ l.libelle }}</td>
                      <td class="num" data-label="Débit">{{ l.debit ? l.debit.toLocaleString('fr-FR') : '' }}</td>
                      <td class="num" data-label="Crédit">{{ l.credit ? l.credit.toLocaleString('fr-FR') : '' }}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-else class="muted">Aucune écriture pour ces critères.</p>
    </div>
  </div>
</template>
