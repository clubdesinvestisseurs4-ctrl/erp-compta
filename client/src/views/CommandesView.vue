<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const today = new Date().toISOString().slice(0, 10);

const commandes = ref([]);
const fournisseurs = ref([]);
const comptes = ref([]);
const error = ref('');
const success = ref('');
const loading = ref(false);
const saving = ref(false);
const compteTresorerie = ref('521');

const form = ref({ fournisseurId: '', date: today });
const lignes = ref([{ compte: '', libelle: '', montant: '' }]);

const totalForm = computed(() =>
  round2(lignes.value.reduce((s, l) => s + (Number(l.montant) || 0), 0))
);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ajouterLigne() {
  lignes.value.push({ compte: '', libelle: '', montant: '' });
}

function supprimerLigne(index) {
  if (lignes.value.length > 1) {
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
    [fournisseurs.value, comptes.value] = await Promise.all([
      api.get(`/api/tiers/${activeSociete.value.id}?type=fournisseur`),
      api.get(`/api/comptes/${activeSociete.value.id}`),
    ]);
  } catch (err) {
    error.value = err.message;
  }
}

async function load() {
  if (!activeSociete.value) return;
  error.value = '';
  loading.value = true;
  try {
    commandes.value = await api.get(`/api/commandes/${activeSociete.value.id}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function creer() {
  error.value = '';
  success.value = '';
  if (!form.value.fournisseurId) {
    error.value = 'Sélectionnez un fournisseur.';
    return;
  }
  const lignesValides = lignes.value.filter(l => l.compte && Number(l.montant) > 0);
  if (lignesValides.length === 0) {
    error.value = 'Ajoutez au moins une ligne avec un compte de charge et un montant.';
    return;
  }

  saving.value = true;
  try {
    const res = await api.post(`/api/commandes/${activeSociete.value.id}`, {
      fournisseurId: form.value.fournisseurId,
      date: form.value.date,
      lignes: lignesValides.map(l => ({ compte: l.compte, libelle: l.libelle, montant: Number(l.montant) })),
    });
    success.value = `Bon de commande ${res.numero} créé.`;
    form.value = { fournisseurId: '', date: today };
    lignes.value = [{ compte: '', libelle: '', montant: '' }];
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function valider(commande) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/commandes/${activeSociete.value.id}/${commande.id}/valider`);
    success.value = 'Bon de commande validé.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function recevoir(commande) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/commandes/${activeSociete.value.id}/${commande.id}/recevoir`);
    success.value = 'Réception comptabilisée.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function payer(commande) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/commandes/${activeSociete.value.id}/${commande.id}/payer`, { compteTresorerie: compteTresorerie.value });
    success.value = 'Paiement comptabilisé.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function supprimer(commande) {
  if (!confirm(`Supprimer le bon de commande ${commande.numero} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/commandes/${activeSociete.value.id}/${commande.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, () => { loadRefs(); load(); }, { immediate: true });
</script>

<template>
  <div>
    <h1>Bons de commande {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <form class="card" @submit.prevent="creer">
      <h2>Nouveau bon de commande</h2>
      <div class="form-row">
        <label style="flex: 1;">
          Fournisseur
          <select v-model="form.fournisseurId" required>
            <option value="" disabled>— Choisir —</option>
            <option v-for="f in fournisseurs" :key="f.id" :value="f.id">{{ f.compteNumero }} — {{ f.nom }}</option>
          </select>
        </label>
        <label>
          Date
          <input v-model="form.date" type="date" required />
        </label>
      </div>

      <table class="table-cards">
        <thead>
          <tr>
            <th>Compte de charge</th>
            <th>Libellé</th>
            <th class="num">Montant</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(ligne, i) in lignes" :key="i">
            <td data-label="Compte de charge">
              <input v-model="ligne.compte" list="comptes-charge-list" placeholder="ex: 601" />
            </td>
            <td data-label="Libellé">
              <input v-model="ligne.libelle" type="text" placeholder="libellé (optionnel)" />
            </td>
            <td class="num" data-label="Montant">
              <input v-model="ligne.montant" type="number" step="0.01" min="0" placeholder="0.00" />
            </td>
            <td data-label="">
              <button type="button" class="btn danger" @click="supprimerLigne(i)" :disabled="lignes.length <= 1">✕ Supprimer</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th class="num" data-label="Montant">{{ totalForm.toLocaleString('fr-FR') }}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>

      <datalist id="comptes-charge-list">
        <option v-for="c in comptes" :key="c.numero" :value="c.numero">{{ compteLabel(c.numero) }}</option>
      </datalist>

      <div class="form-row mt-1">
        <button type="button" class="btn secondary" @click="ajouterLigne">+ Ajouter une ligne</button>
        <button class="btn" type="submit" :disabled="saving">{{ saving ? 'Enregistrement...' : 'Créer le bon de commande' }}</button>
      </div>
    </form>

    <div class="card">
      <div class="form-row">
        <label>
          Compte trésorerie pour le paiement
          <select v-model="compteTresorerie">
            <option value="521">521 — Banques</option>
            <option value="571">571 — Caisse</option>
          </select>
        </label>
      </div>

      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="commandes.length" class="table-cards">
        <thead>
          <tr>
            <th>N°</th>
            <th>Fournisseur</th>
            <th>Date</th>
            <th class="num">Montant</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in commandes" :key="c.id">
            <td data-label="N°">{{ c.numero }}</td>
            <td data-label="Fournisseur">{{ c.fournisseurNom }}</td>
            <td data-label="Date">{{ c.date }}</td>
            <td class="num" data-label="Montant">{{ c.montantTotal.toLocaleString('fr-FR') }}</td>
            <td data-label="Statut">{{ c.statut }}</td>
            <td data-label="" class="actions-cell">
              <button v-if="c.statut === 'brouillon'" class="btn" @click="valider(c)">Valider</button>
              <button v-if="c.statut === 'validee'" class="btn" @click="recevoir(c)">Marquer reçue</button>
              <button v-if="c.statut === 'recue'" class="btn" @click="payer(c)">Marquer payée</button>
              <button v-if="c.statut === 'brouillon'" class="btn danger" @click="supprimer(c)">Supprimer</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun bon de commande.</p>
    </div>
  </div>
</template>
