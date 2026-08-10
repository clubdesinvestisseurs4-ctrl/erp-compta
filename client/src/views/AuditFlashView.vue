<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const today = new Date().toISOString().slice(0, 10);
const debutMois = today.slice(0, 8) + '01';

const dateDebut = ref(debutMois);
const dateFin = ref(today);
const audit = ref(null);
const loading = ref(false);

const estCookafrica = computed(() => activeSociete.value?.id === 'cookafrica');

async function lancer() {
  if (!activeSociete.value) return;
  audit.value = null;
  loading.value = true;
  try {
    audit.value = await api.get(
      `/api/audit-flash/${activeSociete.value.id}?debut=${dateDebut.value}&fin=${dateFin.value}`
    );
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

watch(activeSociete, () => { audit.value = null; }, { immediate: true });
</script>

<template>
  <div>
    <h1>Audit Flash {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div class="card" v-if="!estCookafrica">
      <p class="muted">
        L'Audit Flash n'est disponible que pour la société Cook Africa (son chiffre d'affaires
        vient de l'application de caisse — pas d'écritures de vente saisies manuellement).
        Sélectionnez Cook Africa en haut de page.
      </p>
    </div>

    <template v-else>
      <div class="card">
        <div class="form-row">
          <label>
            Du
            <input v-model="dateDebut" type="date" />
          </label>
          <label>
            Au
            <input v-model="dateFin" type="date" />
          </label>
          <button class="btn" :disabled="loading" @click="lancer">{{ loading ? 'Calcul...' : 'Lancer l\'Audit Flash' }}</button>
        </div>
        <p class="muted">
          Rapport de lecture seule — ne crée ni ne modifie aucune écriture. Compare le chiffre
          d'affaires réel encaissé par Cook Africa (factures payées) aux versements bancaires et
          charges déjà saisis ici, pour estimer un bénéfice réel.
        </p>
      </div>

      <p v-if="loading" class="muted">Chargement...</p>

      <div v-if="audit" class="card">
        <table class="table-cards">
          <tbody>
            <tr>
              <td data-label="Ligne">Chiffre d'affaires encaissé (Cook Africa)</td>
              <td class="num" data-label="Montant">{{ audit.chiffreAffaires.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr v-for="(montant, mode) in audit.chiffreAffairesParMode" :key="mode">
              <td data-label="Ligne">— dont {{ mode }}</td>
              <td class="num" data-label="Montant">{{ montant.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td data-label="Ligne">Versements bancaires enregistrés (compte 512)</td>
              <td class="num" data-label="Montant">{{ audit.versements.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td data-label="Ligne">Charges enregistrées (comptes classe 6)</td>
              <td class="num" data-label="Montant">{{ audit.charges.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr style="font-weight: 600;">
              <td data-label="Ligne">= BÉNÉFICE RÉEL (CA − charges)</td>
              <td class="num" data-label="Montant">{{ audit.beneficeReel.toLocaleString('fr-FR') }}</td>
            </tr>
            <tr>
              <td data-label="Ligne">Écart de trésorerie (CA − versements)</td>
              <td class="num" data-label="Montant" :class="Math.abs(audit.ecartTresorerie) < 1 ? 'success' : 'error'">
                {{ audit.ecartTresorerie.toLocaleString('fr-FR') }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="Math.abs(audit.ecartTresorerie) >= 1" class="error mt-1">
          Cet écart correspond soit à des dépenses payées directement en espèces (non déposées en
          banque), soit à un montant non encore reversé — à vérifier avant de le considérer comme
          une charge.
        </p>
      </div>
    </template>
  </div>
</template>