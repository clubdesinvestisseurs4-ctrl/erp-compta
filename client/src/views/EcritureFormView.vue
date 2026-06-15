<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const router = useRouter();
const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const journaux = ref([]);
const comptes = ref([]);
const error = ref('');
const saving = ref(false);

const today = new Date().toISOString().slice(0, 10);

const form = ref({
  journalCode: '',
  date: today,
  libelle: '',
});

const lignes = ref([
  { compte: '', libelle: '', debit: '', credit: '' },
  { compte: '', libelle: '', debit: '', credit: '' },
]);

const totalDebit = computed(() =>
  round2(lignes.value.reduce((s, l) => s + (Number(l.debit) || 0), 0))
);
const totalCredit = computed(() =>
  round2(lignes.value.reduce((s, l) => s + (Number(l.credit) || 0), 0))
);
const equilibre = computed(() => totalDebit.value === totalCredit.value && totalDebit.value > 0);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ajouterLigne() {
  lignes.value.push({ compte: '', libelle: '', debit: '', credit: '' });
}

function supprimerLigne(index) {
  if (lignes.value.length > 2) {
    lignes.value.splice(index, 1);
  }
}

function compteLabel(numero) {
  const c = comptes.value.find(c => c.numero === numero);
  return c ? `${c.numero} — ${c.libelle}` : numero;
}

async function loadRefs() {
  if (!activeSociete.value) return;
  try {
    [journaux.value, comptes.value] = await Promise.all([
      api.get(`/api/journaux/${activeSociete.value.id}`),
      api.get(`/api/comptes/${activeSociete.value.id}`),
    ]);
    if (journaux.value.length && !form.value.journalCode) {
      form.value.journalCode = journaux.value[0].code;
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function onSubmit() {
  error.value = '';
  if (!activeSociete.value) return;

  const lignesValides = lignes.value.filter(l => l.compte && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (lignesValides.length < 2) {
    error.value = 'Renseignez au moins 2 lignes avec un compte et un montant.';
    return;
  }
  if (!equilibre.value) {
    error.value = `L'écriture est déséquilibrée : débit ${totalDebit.value} ≠ crédit ${totalCredit.value}.`;
    return;
  }

  saving.value = true;
  try {
    await api.post(`/api/ecritures/${activeSociete.value.id}`, {
      journalCode: form.value.journalCode,
      date: form.value.date,
      libelle: form.value.libelle,
      exercice: activeSociete.value.exerciceCourant,
      lignes: lignesValides.map(l => ({
        compte: l.compte,
        libelle: l.libelle,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
    });
    router.push({ name: 'ecritures' });
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

watch(activeSociete, loadRefs, { immediate: true });
</script>

<template>
  <div>
    <h1>Nouvelle écriture {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <form class="card" @submit.prevent="onSubmit">
      <div class="form-row">
        <label>
          Journal
          <select v-model="form.journalCode" required>
            <option v-for="j in journaux" :key="j.code" :value="j.code">{{ j.code }} — {{ j.libelle }}</option>
          </select>
        </label>
        <label>
          Date
          <input v-model="form.date" type="date" required />
        </label>
        <label style="flex: 1;">
          Libellé de l'écriture
          <input v-model="form.libelle" type="text" placeholder="ex: Achat fournitures restaurant" required />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Compte</th>
            <th>Libellé ligne</th>
            <th class="num">Débit</th>
            <th class="num">Crédit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(ligne, i) in lignes" :key="i">
            <td>
              <input v-model="ligne.compte" list="comptes-list" placeholder="numéro de compte" />
            </td>
            <td>
              <input v-model="ligne.libelle" type="text" placeholder="libellé (optionnel)" />
            </td>
            <td class="num">
              <input v-model="ligne.debit" type="number" step="0.01" min="0" placeholder="0.00" />
            </td>
            <td class="num">
              <input v-model="ligne.credit" type="number" step="0.01" min="0" placeholder="0.00" />
            </td>
            <td>
              <button type="button" class="btn danger" @click="supprimerLigne(i)" :disabled="lignes.length <= 2">✕</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            <th class="num">{{ totalDebit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ totalCredit.toLocaleString('fr-FR') }}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>

      <datalist id="comptes-list">
        <option v-for="c in comptes" :key="c.numero" :value="c.numero">{{ compteLabel(c.numero) }}</option>
      </datalist>

      <div class="form-row mt-1">
        <button type="button" class="btn secondary" @click="ajouterLigne">+ Ajouter une ligne</button>
        <span :class="equilibre ? 'success' : 'error'" style="margin: 0;">
          {{ equilibre ? 'Écriture équilibrée' : `Déséquilibre : ${(totalDebit - totalCredit).toFixed(2)}` }}
        </span>
      </div>

      <div class="form-row mt-1">
        <button class="btn" type="submit" :disabled="saving || !equilibre">
          {{ saving ? 'Enregistrement...' : 'Enregistrer l\'écriture' }}
        </button>
      </div>
    </form>
  </div>
</template>
