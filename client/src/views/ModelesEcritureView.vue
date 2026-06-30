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

const today = new Date().toISOString().slice(0, 10);

const modeles = ref([]);
const journaux = ref([]);
const comptes = ref([]);
const saving = ref(false);
const generating = ref(false);

const form = ref({ nom: '', journalCode: '' });
const lignesModele = ref([
  { compte: '', libelle: '', debit: '', credit: '' },
  { compte: '', libelle: '', debit: '', credit: '' },
]);

const modeleSelectionne = ref(null);
const dateGeneration = ref(today);
const libelleGeneration = ref('');
const lignesGeneration = ref([]);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function compteLabel(numero) {
  const c = comptes.value.find(c => c.numero === numero);
  return c ? `${c.numero} — ${c.libelle}` : numero;
}

function totalDebitCredit(lignes) {
  return {
    debit: round2(lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0)),
    credit: round2(lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0)),
  };
}

const totalModele = computed(() => totalDebitCredit(lignesModele.value));
const totalGeneration = computed(() => totalDebitCredit(lignesGeneration.value));
const equilibreGeneration = computed(() => totalGeneration.value.debit === totalGeneration.value.credit && totalGeneration.value.debit > 0);

async function loadRefs() {
  if (!activeSociete.value) return;
  try {
    const societeId = activeSociete.value.id;
    [journaux.value, comptes.value] = await Promise.all([
      refCache.get(`journaux:${societeId}`, () => api.get(`/api/journaux/${societeId}`)),
      refCache.get(`comptes:${societeId}`, () => api.get(`/api/comptes/${societeId}`)),
    ]);
  } catch (err) {
    toast.error(err.message);
  }
}

async function load() {
  if (!activeSociete.value) return;
  try {
    modeles.value = await api.get(`/api/modeles/${activeSociete.value.id}`);
  } catch (err) {
    toast.error(err.message);
  }
}

function ajouterLigne(lignes) {
  lignes.push({ compte: '', libelle: '', debit: '', credit: '' });
}
function supprimerLigne(lignes, index) {
  if (lignes.length > 2) lignes.splice(index, 1);
}

async function enregistrerModele() {
  if (!form.value.nom || !form.value.journalCode) {
    toast.error('Le nom et le journal sont requis.');
    return;
  }
  const lignesValides = lignesModele.value.filter(l => l.compte);
  if (lignesValides.length < 2) {
    toast.error('Renseignez au moins 2 lignes avec un compte.');
    return;
  }

  saving.value = true;
  try {
    await api.post(`/api/modeles/${activeSociete.value.id}`, {
      nom: form.value.nom,
      journalCode: form.value.journalCode,
      lignes: lignesValides.map(l => ({ compte: l.compte, libelle: l.libelle, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    });
    toast.success(`Modèle « ${form.value.nom} » enregistré.`);
    form.value = { nom: '', journalCode: '' };
    lignesModele.value = [{ compte: '', libelle: '', debit: '', credit: '' }, { compte: '', libelle: '', debit: '', credit: '' }];
    await load();
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

async function supprimerModele(modele) {
  if (!(await confirmStore.ask(`Supprimer le modèle « ${modele.nom} » ?`, { danger: true, confirmLabel: 'Supprimer' }))) return;
  try {
    await api.delete(`/api/modeles/${activeSociete.value.id}/${modele.id}`);
    toast.success(`Modèle « ${modele.nom} » supprimé.`);
    if (modeleSelectionne.value && modeleSelectionne.value.id === modele.id) {
      modeleSelectionne.value = null;
    }
    await load();
  } catch (err) {
    toast.error(err.message);
  }
}

function utiliser(modele) {
  modeleSelectionne.value = modele;
  dateGeneration.value = today;
  libelleGeneration.value = modele.nom;
  lignesGeneration.value = modele.lignes.map(l => ({ ...l, debit: l.debit || '', credit: l.credit || '' }));
}

async function genererEcriture() {
  const lignesValides = lignesGeneration.value.filter(l => l.compte && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (lignesValides.length < 2) {
    toast.error('Renseignez au moins 2 lignes avec un compte et un montant.');
    return;
  }
  if (!equilibreGeneration.value) {
    toast.error(`Écriture déséquilibrée : débit ${totalGeneration.value.debit} ≠ crédit ${totalGeneration.value.credit}.`);
    return;
  }

  generating.value = true;
  try {
    const res = await api.post(`/api/modeles/${activeSociete.value.id}/${modeleSelectionne.value.id}/generer`, {
      date: dateGeneration.value,
      libelle: libelleGeneration.value,
      lignes: lignesValides.map(l => ({ compte: l.compte, libelle: l.libelle, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    });
    toast.success(`Écriture générée à partir du modèle « ${modeleSelectionne.value.nom} ».`);
    modeleSelectionne.value = null;
  } catch (err) {
    toast.error(err.message);
  } finally {
    generating.value = false;
  }
}

watch(activeSociete, () => { loadRefs(); load(); modeleSelectionne.value = null; }, { immediate: true });
</script>

<template>
  <div>
    <h1>Modèles d'écritures récurrentes {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <h2>Mes modèles</h2>
      <table v-if="modeles.length" class="table-cards">
        <thead>
          <tr><th>Nom</th><th>Journal</th><th>Lignes</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="m in modeles" :key="m.id">
            <td data-label="Nom">{{ m.nom }}</td>
            <td data-label="Journal">{{ m.journalCode }}</td>
            <td data-label="Lignes">{{ m.lignes.length }}</td>
            <td data-label="" class="actions-cell">
              <button class="btn" @click="utiliser(m)">Utiliser</button>
              <button class="btn danger" @click="supprimerModele(m)">Supprimer</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun modèle enregistré.</p>
    </div>

    <form class="card" @submit.prevent="enregistrerModele">
      <h2>Nouveau modèle</h2>
      <div class="form-row">
        <label>
          Nom du modèle
          <input v-model="form.nom" type="text" placeholder="ex: Loyer mensuel" />
        </label>
        <label>
          Journal
          <select v-model="form.journalCode">
            <option value="" disabled>— Choisir —</option>
            <option v-for="j in journaux" :key="j.code" :value="j.code">{{ j.code }} — {{ j.libelle }}</option>
          </select>
        </label>
      </div>

      <table class="table-cards">
        <thead>
          <tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(ligne, i) in lignesModele" :key="i">
            <td data-label="Compte"><input v-model="ligne.compte" list="comptes-modele-list" placeholder="numéro de compte" /></td>
            <td data-label="Libellé"><input v-model="ligne.libelle" type="text" placeholder="libellé (optionnel)" /></td>
            <td class="num" data-label="Débit"><input v-model="ligne.debit" type="number" step="0.01" min="0" placeholder="0.00 (ou laisser vide)" /></td>
            <td class="num" data-label="Crédit"><input v-model="ligne.credit" type="number" step="0.01" min="0" placeholder="0.00 (ou laisser vide)" /></td>
            <td data-label=""><button type="button" class="btn danger" @click="supprimerLigne(lignesModele, i)" :disabled="lignesModele.length <= 2">✕</button></td>
          </tr>
        </tbody>
      </table>

      <datalist id="comptes-modele-list">
        <option v-for="c in comptes" :key="c.numero" :value="c.numero">{{ compteLabel(c.numero) }}</option>
      </datalist>

      <p class="muted">Les montants sont optionnels ici : laissez-les à 0 si le montant varie à chaque utilisation (vous les saisirez lors de la génération).</p>

      <div class="form-row mt-1">
        <button type="button" class="btn secondary" @click="ajouterLigne(lignesModele)">+ Ajouter une ligne</button>
        <button class="btn" type="submit" :disabled="saving">{{ saving ? 'Enregistrement...' : 'Enregistrer le modèle' }}</button>
      </div>
    </form>

    <form v-if="modeleSelectionne" class="card" @submit.prevent="genererEcriture">
      <h2>Générer une écriture depuis « {{ modeleSelectionne.nom }} »</h2>
      <div class="form-row">
        <label>
          Date
          <input v-model="dateGeneration" type="date" required />
        </label>
        <label style="flex: 1;">
          Libellé
          <input v-model="libelleGeneration" type="text" />
        </label>
      </div>

      <table class="table-cards">
        <thead>
          <tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(ligne, i) in lignesGeneration" :key="i">
            <td data-label="Compte"><input v-model="ligne.compte" list="comptes-modele-list" /></td>
            <td data-label="Libellé"><input v-model="ligne.libelle" type="text" /></td>
            <td class="num" data-label="Débit"><input v-model="ligne.debit" type="number" step="0.01" min="0" /></td>
            <td class="num" data-label="Crédit"><input v-model="ligne.credit" type="number" step="0.01" min="0" /></td>
            <td data-label=""><button type="button" class="btn danger" @click="supprimerLigne(lignesGeneration, i)" :disabled="lignesGeneration.length <= 2">✕</button></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            <th class="num">{{ totalGeneration.debit.toLocaleString('fr-FR') }}</th>
            <th class="num">{{ totalGeneration.credit.toLocaleString('fr-FR') }}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>

      <div class="form-row mt-1">
        <button type="button" class="btn secondary" @click="ajouterLigne(lignesGeneration)">+ Ajouter une ligne</button>
        <span :class="equilibreGeneration ? 'success' : 'error'" style="margin: 0;">
          {{ equilibreGeneration ? 'Écriture équilibrée' : `Déséquilibre : ${(totalGeneration.debit - totalGeneration.credit).toFixed(2)}` }}
        </span>
      </div>

      <div class="form-row mt-1">
        <button class="btn" type="submit" :disabled="generating || !equilibreGeneration">
          {{ generating ? 'Génération...' : 'Générer l\'écriture' }}
        </button>
        <button type="button" class="btn secondary" @click="modeleSelectionne = null">Annuler</button>
      </div>
    </form>
  </div>
</template>
