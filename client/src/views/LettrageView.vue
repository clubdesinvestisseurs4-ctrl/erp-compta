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

const type = ref('fournisseur');
const tiersList = ref([]);
const tiersId = ref('');
const mouvements = ref([]);
const selection = ref(new Set());
const loading = ref(false);

const compteSelectionne = computed(() => {
  const t = tiersList.value.find(t => t.id === tiersId.value);
  return t ? t.compteNumero : '';
});

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function cle(m) {
  return `${m.ecritureId}_${m.ligneIndex}`;
}

const totalSelection = computed(() => {
  let s = 0;
  for (const m of mouvements.value) {
    if (selection.value.has(cle(m))) s += m.debit - m.credit;
  }
  return round2(s);
});

const peutLettrer = computed(() => selection.value.size >= 2 && totalSelection.value === 0);

async function loadTiers() {
  if (!activeSociete.value) return;
  const societeId = activeSociete.value.id;
  tiersList.value = await refCache.get(`tiers:${societeId}:${type.value}`, () => api.get(`/api/tiers/${societeId}?type=${type.value}`));
  tiersId.value = '';
  mouvements.value = [];
}

async function loadMouvements() {
  if (!activeSociete.value || !compteSelectionne.value) return;
  selection.value = new Set();
  loading.value = true;
  try {
    mouvements.value = await api.get(`/api/lettrage/${activeSociete.value.id}/${compteSelectionne.value}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

function toggle(m) {
  if (m.lettre) return;
  const key = cle(m);
  const next = new Set(selection.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  selection.value = next;
}

async function lettrer() {
  const mvts = mouvements.value
    .filter(m => selection.value.has(cle(m)))
    .map(m => ({ ecritureId: m.ecritureId, ligneIndex: m.ligneIndex }));
  try {
    const res = await api.post(`/api/lettrage/${activeSociete.value.id}/${compteSelectionne.value}`, { mouvements: mvts });
    toast.success(`Lettre ${res.lettre} attribuée.`);
    await loadMouvements();
  } catch (err) {
    toast.error(err.message);
  }
}

async function lettrageAuto() {
  try {
    const res = await api.post(`/api/lettrage/${activeSociete.value.id}/${compteSelectionne.value}/auto`);
    toast.success(res.message);
    await loadMouvements();
  } catch (err) {
    toast.error(err.message);
  }
}

async function delettrer(lettre) {
  if (!(await confirmStore.ask(`Annuler le lettrage ${lettre} ?`, { danger: true, confirmLabel: 'Annuler le lettrage' }))) return;
  try {
    await api.delete(`/api/lettrage/${activeSociete.value.id}/${compteSelectionne.value}/${lettre}`);
    toast.success(`Lettrage ${lettre} annulé.`);
    await loadMouvements();
  } catch (err) {
    toast.error(err.message);
  }
}

watch(activeSociete, loadTiers, { immediate: true });
watch(type, loadTiers);
watch(tiersId, loadMouvements);
</script>

<template>
  <div>
    <h1>Lettrage {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card">
      <div class="form-row">
        <label><input type="radio" value="client" v-model="type" /> Clients</label>
        <label><input type="radio" value="fournisseur" v-model="type" /> Fournisseurs</label>
        <label style="flex: 1;">
          Tiers
          <select v-model="tiersId">
            <option value="" disabled>— Choisir —</option>
            <option v-for="t in tiersList" :key="t.id" :value="t.id">{{ t.compteNumero }} — {{ t.nom }}</option>
          </select>
        </label>
        <button class="btn secondary" :disabled="!compteSelectionne" @click="lettrageAuto">Lettrage automatique</button>
      </div>
      <p class="muted">Le lettrage automatique ne fait que les correspondances exactes 1 pour 1 (même montant). Le reste se sélectionne manuellement ci-dessous.</p>
    </div>

    <div v-if="compteSelectionne" class="card">
      <p v-if="loading" class="muted">Chargement...</p>
      <table v-else-if="mouvements.length" class="table-cards">
        <thead>
          <tr>
            <th></th>
            <th>Date</th>
            <th>Journal</th>
            <th>N°</th>
            <th>Libellé</th>
            <th class="num">Débit</th>
            <th class="num">Crédit</th>
            <th>Lettre</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in mouvements" :key="cle(m)">
            <td>
              <input type="checkbox" :disabled="!!m.lettre" :checked="selection.has(cle(m))" @change="toggle(m)" />
            </td>
            <td data-label="Date">{{ m.date }}</td>
            <td data-label="Journal">{{ m.journalCode }}</td>
            <td data-label="N°">{{ m.numero }}</td>
            <td data-label="Libellé">{{ m.libelle }}</td>
            <td class="num" data-label="Débit">{{ m.debit ? m.debit.toLocaleString('fr-FR') : '' }}</td>
            <td class="num" data-label="Crédit">{{ m.credit ? m.credit.toLocaleString('fr-FR') : '' }}</td>
            <td data-label="Lettre">
              <span v-if="m.lettre">
                {{ m.lettre }}
                <button class="btn danger" @click="delettrer(m.lettre)">✕</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun mouvement sur ce compte.</p>

      <div class="form-row mt-1">
        <span :class="peutLettrer ? 'success' : 'muted'" style="margin: 0;">
          Sélection : {{ selection.size }} ligne(s), solde {{ totalSelection.toLocaleString('fr-FR') }}
        </span>
        <button class="btn" :disabled="!peutLettrer" @click="lettrer">Lettrer la sélection</button>
      </div>
    </div>
  </div>
</template>
