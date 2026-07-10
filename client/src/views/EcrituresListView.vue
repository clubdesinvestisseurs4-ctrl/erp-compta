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

const journaux = ref([]);
const ecritures = ref([]);
const loading = ref(false);
const expanded = ref(new Set());

const filtreJournal = ref('');
const filtreExercice = ref(null);

// ── Recherche ────────────────────────────────────────────────────────────────
const rechercheTexte   = ref('');
const filtreDateDebut  = ref('');
const filtreDateFin    = ref('');
const filtreMontantMin = ref('');
const filtreMontantMax = ref('');
const filtreCompte     = ref('');

const rechercheActive = computed(() =>
  rechercheTexte.value || filtreDateDebut.value || filtreDateFin.value ||
  filtreMontantMin.value || filtreMontantMax.value || filtreCompte.value
);

function reinitialiserRecherche() {
  rechercheTexte.value   = '';
  filtreDateDebut.value  = '';
  filtreDateFin.value    = '';
  filtreMontantMin.value = '';
  filtreMontantMax.value = '';
  filtreCompte.value     = '';
}

const ecrituresFiltrees = computed(() => {
  let liste = ecritures.value;

  if (filtreDateDebut.value)
    liste = liste.filter(e => e.date >= filtreDateDebut.value);
  if (filtreDateFin.value)
    liste = liste.filter(e => e.date <= filtreDateFin.value);
  if (filtreMontantMin.value !== '')
    liste = liste.filter(e => e.totalDebit >= Number(filtreMontantMin.value));
  if (filtreMontantMax.value !== '')
    liste = liste.filter(e => e.totalDebit <= Number(filtreMontantMax.value));
  if (filtreCompte.value)
    liste = liste.filter(e => e.lignes && e.lignes.some(l => l.compte && l.compte.startsWith(filtreCompte.value)));

  const q = rechercheTexte.value.trim().toLowerCase();
  if (q) {
    liste = liste.filter(e => {
      if ((e.libelle || '').toLowerCase().includes(q)) return true;
      if (String(e.numero).includes(q)) return true;
      if ((e.journalCode || '').toLowerCase().includes(q)) return true;
      if (e.lignes && e.lignes.some(l =>
        (l.libelle || '').toLowerCase().includes(q) ||
        (l.compte  || '').toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }

  return liste;
});

async function loadJournaux() {
  if (!activeSociete.value) return;
  const societeId = activeSociete.value.id;
  journaux.value = await refCache.get(`journaux:${societeId}`, () => api.get(`/api/journaux/${societeId}`));
}

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (filtreJournal.value) params.set('journal', filtreJournal.value);
    params.set('exercice', filtreExercice.value);
    ecritures.value = await api.get(`/api/ecritures/${activeSociete.value.id}?${params.toString()}`);
  } catch (err) {
    toast.error(err.message);
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

async function exporterFec() {
  try {
    await api.downloadFile(
      `/api/export/${activeSociete.value.id}/fec?exercice=${filtreExercice.value}`,
      `FEC_${activeSociete.value.id}_${filtreExercice.value}.txt`
    );
  } catch (err) {
    toast.error(err.message);
  }
}

async function extourner(ecriture) {
  const ok = await confirmStore.ask(
    `Extourner (annuler) l'écriture ${ecriture.journalCode}-${ecriture.numero} ? Une écriture inverse sera générée.`,
    { danger: true, confirmLabel: 'Extourner' }
  );
  if (!ok) return;
  try {
    await api.post(`/api/ecritures/${activeSociete.value.id}/${ecriture.id}/extourner`);
    toast.success('Écriture extournée.');
    await load();
  } catch (err) {
    toast.error(err.message);
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
        <button class="btn secondary" @click="exporterFec">Exporter FEC</button>
      </div>

      <!-- Barre de recherche -->
      <div style="margin-top: 1rem; border-top: 1px solid var(--color-border, #e5e7eb); padding-top: 1rem;">
        <div class="form-row" style="align-items: flex-end;">
          <label style="flex: 2 1 260px;">
            Recherche libre
            <input
              v-model="rechercheTexte"
              type="text"
              placeholder="Libellé, fournisseur, n° de compte, numéro écriture…"
              style="width: 100%;"
            />
          </label>
          <label>
            Compte
            <input v-model="filtreCompte" type="text" placeholder="ex. 604" style="width: 90px;" />
          </label>
          <label>
            Du
            <input v-model="filtreDateDebut" type="date" />
          </label>
          <label>
            Au
            <input v-model="filtreDateFin" type="date" />
          </label>
          <label>
            Montant min
            <input v-model.number="filtreMontantMin" type="number" placeholder="0" style="width: 110px;" />
          </label>
          <label>
            Montant max
            <input v-model.number="filtreMontantMax" type="number" placeholder="∞" style="width: 110px;" />
          </label>
          <button v-if="rechercheActive" class="btn secondary" @click="reinitialiserRecherche">
            ✕ Réinitialiser
          </button>
        </div>
        <p v-if="rechercheActive" style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--color-muted, #6b7280);">
          <strong>{{ ecrituresFiltrees.length }}</strong> écriture(s) trouvée(s) sur {{ ecritures.length }}
        </p>
      </div>
    </div>

    <div class="card">
      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="ecrituresFiltrees.length" class="table-cards">
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
          <template v-for="ec in ecrituresFiltrees" :key="ec.id">
            <tr style="cursor: pointer;" @click="toggle(ec.id)">
              <td data-label="Date">{{ ec.date }}</td>
              <td data-label="Journal">{{ ec.journalCode }}</td>
              <td data-label="N°">{{ ec.numero }}</td>
              <td data-label="Libellé">{{ ec.libelle }} <span v-if="ec.extourneeParId" class="muted">(extournée)</span></td>
              <td class="num" data-label="Débit">{{ ec.totalDebit.toLocaleString('fr-FR') }}</td>
              <td class="num" data-label="Crédit">{{ ec.totalCredit.toLocaleString('fr-FR') }}</td>
              <td>
                <button v-if="!ec.extourneeParId" class="btn danger" @click.stop="extourner(ec)">Extourner</button>
              </td>
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
      <p v-else-if="rechercheActive" class="muted">Aucune écriture ne correspond à la recherche.</p>
      <p v-else class="muted">Aucune écriture pour ces critères.</p>
    </div>
  </div>
</template>
