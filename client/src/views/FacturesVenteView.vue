<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);

const today = new Date().toISOString().slice(0, 10);

const factures = ref([]);
const clients = ref([]);
const comptes = ref([]);
const error = ref('');
const success = ref('');
const loading = ref(false);
const saving = ref(false);
const compteTresorerie = ref('521');

const form = ref({ clientId: '', date: today });
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
    [clients.value, comptes.value] = await Promise.all([
      api.get(`/api/tiers/${activeSociete.value.id}?type=client`),
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
    factures.value = await api.get(`/api/factures/${activeSociete.value.id}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function creer() {
  error.value = '';
  success.value = '';
  if (!form.value.clientId) {
    error.value = 'Sélectionnez un client.';
    return;
  }
  const lignesValides = lignes.value.filter(l => l.compte && Number(l.montant) > 0);
  if (lignesValides.length === 0) {
    error.value = 'Ajoutez au moins une ligne avec un compte de produit et un montant.';
    return;
  }

  saving.value = true;
  try {
    const res = await api.post(`/api/factures/${activeSociete.value.id}`, {
      clientId: form.value.clientId,
      date: form.value.date,
      lignes: lignesValides.map(l => ({ compte: l.compte, libelle: l.libelle, montant: Number(l.montant) })),
    });
    success.value = `Facture ${res.numero} créée.`;
    form.value = { clientId: '', date: today };
    lignes.value = [{ compte: '', libelle: '', montant: '' }];
    await load();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function valider(facture) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/factures/${activeSociete.value.id}/${facture.id}/valider`);
    success.value = 'Facture validée.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function facturer(facture) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/factures/${activeSociete.value.id}/${facture.id}/facturer`);
    success.value = 'Facture émise et comptabilisée.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function encaisser(facture) {
  error.value = '';
  success.value = '';
  try {
    await api.post(`/api/factures/${activeSociete.value.id}/${facture.id}/encaisser`, { compteTresorerie: compteTresorerie.value });
    success.value = 'Encaissement comptabilisé.';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function supprimer(facture) {
  if (!confirm(`Supprimer la facture ${facture.numero} ?`)) return;
  error.value = '';
  try {
    await api.delete(`/api/factures/${activeSociete.value.id}/${facture.id}`);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

watch(activeSociete, () => { loadRefs(); load(); }, { immediate: true });
</script>

<template>
  <div>
    <h1>Factures de vente {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>

    <form class="card" @submit.prevent="creer">
      <h2>Nouvelle facture</h2>
      <div class="form-row">
        <label style="flex: 1;">
          Client
          <select v-model="form.clientId" required>
            <option value="" disabled>— Choisir —</option>
            <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.compteNumero }} — {{ c.nom }}</option>
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
            <th>Compte de produit</th>
            <th>Libellé</th>
            <th class="num">Montant</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(ligne, i) in lignes" :key="i">
            <td data-label="Compte de produit">
              <input v-model="ligne.compte" list="comptes-produit-list" placeholder="ex: 701" />
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

      <datalist id="comptes-produit-list">
        <option v-for="c in comptes" :key="c.numero" :value="c.numero">{{ compteLabel(c.numero) }}</option>
      </datalist>

      <div class="form-row mt-1">
        <button type="button" class="btn secondary" @click="ajouterLigne">+ Ajouter une ligne</button>
        <button class="btn" type="submit" :disabled="saving">{{ saving ? 'Enregistrement...' : 'Créer la facture' }}</button>
      </div>
    </form>

    <div class="card">
      <div class="form-row">
        <label>
          Compte trésorerie pour l'encaissement
          <select v-model="compteTresorerie">
            <option value="521">521 — Banques</option>
            <option value="571">571 — Caisse</option>
          </select>
        </label>
      </div>

      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="factures.length" class="table-cards">
        <thead>
          <tr>
            <th>N°</th>
            <th>Client</th>
            <th>Date</th>
            <th class="num">Montant</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in factures" :key="f.id">
            <td data-label="N°">{{ f.numero }}</td>
            <td data-label="Client">{{ f.clientNom }}</td>
            <td data-label="Date">{{ f.date }}</td>
            <td class="num" data-label="Montant">{{ f.montantTotal.toLocaleString('fr-FR') }}</td>
            <td data-label="Statut">{{ f.statut }}</td>
            <td data-label="" class="actions-cell">
              <button v-if="f.statut === 'brouillon'" class="btn" @click="valider(f)">Valider</button>
              <button v-if="f.statut === 'validee'" class="btn" @click="facturer(f)">Émettre la facture</button>
              <button v-if="f.statut === 'facturee'" class="btn" @click="encaisser(f)">Marquer encaissée</button>
              <button v-if="f.statut === 'brouillon'" class="btn danger" @click="supprimer(f)">Supprimer</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucune facture de vente.</p>
    </div>
  </div>
</template>
