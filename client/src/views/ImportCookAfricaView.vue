<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { api } from '../api/client';

// Import des ventes et dépenses de l'app Cook Africa en écritures comptables :
// 1. aperçu (rien n'est écrit), 2. import de ce même aperçu par l'admin ou le comptable.
const societeStore = useSocieteStore();
const auth = useAuthStore();
const toast = useToastStore();
const activeSociete = computed(() => societeStore.activeSociete);
const peutImporter = computed(() => ['admin', 'comptable'].includes(auth.user && auth.user.role));

function moisCourant() {
  const d = new Date();
  const debut = new Date(d.getFullYear(), d.getMonth(), 1);
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { debut: iso(debut), fin: iso(d) };
}

const debut = ref(moisCourant().debut);
const fin = ref(moisCourant().fin);
const apercu = ref(null);
const loading = ref(false);
const importing = ref(false);
const filtre = ref('a-faire');

const STATUTS = {
  nouveau: 'À importer',
  modifie: 'Modifiée dans Cook Africa — sera extournée puis refaite',
  supprime: 'Supprimée dans Cook Africa — sera extournée',
  'a-jour': 'Déjà importée',
};
const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR');
const operations = computed(() => {
  const ops = (apercu.value && apercu.value.operations) || [];
  return filtre.value === 'a-faire' ? ops.filter(o => o.statut !== 'a-jour') : ops;
});
const aFaire = computed(() => apercu.value
  ? apercu.value.resume.nouveau + apercu.value.resume.modifie + apercu.value.resume.supprime : 0);

async function charger() {
  if (!activeSociete.value || activeSociete.value.id !== 'cookafrica') return;
  loading.value = true;
  apercu.value = null;
  try {
    apercu.value = await api.get(`/api/cookafrica/cookafrica/apercu?debut=${debut.value}&fin=${fin.value}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function importer() {
  if (!window.confirm(`Créer ${aFaire.value} opération(s) comptable(s) pour la période du ${debut.value} au ${fin.value} ?`)) return;
  importing.value = true;
  try {
    const r = await api.post('/api/cookafrica/cookafrica/importer', { debut: debut.value, fin: fin.value });
    if (r.erreurs && r.erreurs.length) {
      toast.error(`${r.crees} écriture(s) créée(s), ${r.erreurs.length} erreur(s) : ${r.erreurs[0].error}`);
    } else {
      toast.success(`${r.crees} écriture(s) créée(s), ${r.extournes} extourne(s).`);
    }
    await charger();
  } catch (err) {
    toast.error(err.message);
  } finally {
    importing.value = false;
  }
}

watch(activeSociete, charger, { immediate: true });
</script>

<template>
  <div>
    <h1>Import Cook Africa</h1>

    <div v-if="!activeSociete || activeSociete.id !== 'cookafrica'" class="card">
      <p>Sélectionnez la société <strong>Cook Africa</strong> pour importer ses ventes et dépenses.</p>
    </div>

    <template v-else>
      <div class="card">
        <p class="muted">
          Les ventes encaissées (une écriture par jour) et les dépenses saisies dans l'application
          Cook Africa deviennent des écritures comptables. Rien n'est enregistré avant d'avoir cliqué
          sur « Importer ». Réimporter une période ne crée jamais de doublon.
        </p>
        <div class="form-row">
          <label>Du <input v-model="debut" type="date" /></label>
          <label>Au <input v-model="fin" type="date" /></label>
          <button class="btn secondary" :disabled="loading" @click="charger">Voir l'aperçu</button>
          <button v-if="peutImporter" class="btn" :disabled="!apercu || !aFaire || importing || apercu.comptesManquants.length || apercu.exerciceClos" @click="importer">
            {{ importing ? 'Import…' : `Importer (${aFaire})` }}
          </button>
        </div>
        <p class="muted">Période de 3 mois maximum, dans une seule année. Cook Africa peut mettre jusqu'à une minute à répondre s'il était en veille.</p>
      </div>

      <p v-if="loading" class="muted">Interrogation de Cook Africa…</p>

      <template v-if="apercu">
        <div v-if="apercu.comptesManquants.length" class="error">
          Comptes absents du plan comptable : {{ apercu.comptesManquants.join(', ') }}. Ajoutez-les avant d'importer.
        </div>
        <div v-if="apercu.exerciceClos" class="error">L'exercice est clôturé : import impossible.</div>

        <div class="card">
          <p>
            <strong>{{ apercu.resume.nouveau }}</strong> nouvelle(s),
            <strong>{{ apercu.resume.modifie }}</strong> modifiée(s),
            <strong>{{ apercu.resume.supprime }}</strong> supprimée(s),
            {{ apercu.resume['a-jour'] }} déjà importée(s).
          </p>
          <label>
            Afficher
            <select v-model="filtre">
              <option value="a-faire">Seulement ce qui reste à faire</option>
              <option value="tout">Tout</option>
            </select>
          </label>
          <table class="table-cards">
            <thead><tr><th>Date</th><th>Journal</th><th>Libellé</th><th>Écriture proposée</th><th class="num">Montant</th><th>Statut</th></tr></thead>
            <tbody>
              <tr v-for="o in operations" :key="o.cle">
                <td data-label="Date">{{ o.ecriture ? o.ecriture.date : '' }}</td>
                <td data-label="Journal">{{ o.ecriture ? o.ecriture.journalCode : '' }}</td>
                <td data-label="Libellé">{{ o.ecriture ? o.ecriture.libelle : o.cle }}</td>
                <td data-label="Écriture">
                  <div v-for="l in (o.ecriture ? o.ecriture.lignes : [])" :key="l.compte + l.libelle" class="muted">
                    {{ l.debit ? 'D' : 'C' }} {{ l.compte }} — {{ fmt(l.debit || l.credit) }}
                  </div>
                </td>
                <td class="num" data-label="Montant">{{ fmt(o.montant) }}</td>
                <td data-label="Statut">{{ STATUTS[o.statut] }}</td>
              </tr>
              <tr v-if="!operations.length"><td colspan="6" class="muted">Rien à importer sur cette période.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h2>Correspondances utilisées</h2>
          <p class="muted">À faire valider par votre comptable. Modifiables sans intervention technique (API /mapping).</p>
          <table class="table-cards">
            <thead><tr><th>Dans Cook Africa</th><th>Compte</th></tr></thead>
            <tbody>
              <tr><td>Ventes (crédit)</td><td>{{ apercu.mapping.compteVentes }}</td></tr>
              <tr v-for="(c, mode) in apercu.mapping.tresorerie" :key="'t' + mode"><td>Paiement : {{ mode }}</td><td>{{ c }}</td></tr>
              <tr v-for="(c, cat) in apercu.mapping.charges" :key="'c' + cat"><td>Dépense : {{ cat }}</td><td>{{ c }}</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>
