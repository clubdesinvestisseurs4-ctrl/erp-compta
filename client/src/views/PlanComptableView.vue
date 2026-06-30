<script setup>
import { ref, computed, watch } from 'vue';
import { useSocieteStore } from '../stores/societe';
import { api } from '../api/client';
import { useToastStore } from '../stores/toast';

const societeStore = useSocieteStore();
const activeSociete = computed(() => societeStore.activeSociete);
const toast = useToastStore();

const comptes = ref([]);
const erreursImport = ref([]);
const loading = ref(false);
const importing = ref(false);
const search = ref('');

const nouveauCompte = ref({ numero: '', libelle: '', classe: 6 });
const fichierExcel = ref(null);
const fichierInput = ref(null);

const comptesFiltres = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return comptes.value;
  return comptes.value.filter(c =>
    c.numero.includes(term) || c.libelle.toLowerCase().includes(term)
  );
});

async function load() {
  if (!activeSociete.value) return;
  loading.value = true;
  try {
    comptes.value = await api.get(`/api/comptes/${activeSociete.value.id}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function seed() {
  if (!activeSociete.value) return;
  try {
    const res = await api.post(`/api/comptes/${activeSociete.value.id}/seed`);
    toast.success(`Plan comptable SYSCOHADA initialisé (${res.count} comptes).`);
    await load();
  } catch (err) {
    toast.error(err.message);
  }
}

function onFichierChange(e) {
  fichierExcel.value = e.target.files[0] || null;
}

async function importerExcel() {
  if (!activeSociete.value || !fichierExcel.value) return;
  erreursImport.value = [];
  importing.value = true;
  try {
    const formData = new FormData();
    formData.append('fichier', fichierExcel.value);
    const res = await api.uploadFile(`/api/comptes/${activeSociete.value.id}/import`, formData);
    toast.success(`Plan comptable importé (${res.count} comptes).`);
    fichierExcel.value = null;
    if (fichierInput.value) fichierInput.value.value = '';
    await load();
  } catch (err) {
    toast.error(err.message);
    erreursImport.value = err.details || [];
  } finally {
    importing.value = false;
  }
}

async function ajouterCompte() {
  if (!activeSociete.value) return;
  try {
    await api.post(`/api/comptes/${activeSociete.value.id}`, {
      numero: nouveauCompte.value.numero.trim(),
      libelle: nouveauCompte.value.libelle.trim(),
      classe: Number(nouveauCompte.value.classe),
    });
    toast.success(`Compte ${nouveauCompte.value.numero} créé.`);
    nouveauCompte.value = { numero: '', libelle: '', classe: 6 };
    await load();
  } catch (err) {
    toast.error(err.message);
  }
}

watch(activeSociete, load, { immediate: true });
</script>

<template>
  <div>
    <h1>Plan comptable {{ activeSociete ? '— ' + activeSociete.nom : '' }}</h1>

    <div v-if="erreursImport.length" class="error">
      <p>Erreurs de validation du fichier importé :</p>
      <ul>
        <li v-for="(e, i) in erreursImport" :key="i">{{ e }}</li>
      </ul>
    </div>

    <div class="card" v-if="!loading && comptes.length === 0">
      <p>Aucun compte. Initialiser le référentiel SYSCOHADA pour cette société ?</p>
      <button class="btn" @click="seed">Initialiser le plan comptable SYSCOHADA</button>
    </div>

    <div class="card">
      <h2>Importer un plan comptable depuis Excel</h2>
      <p class="muted">
        Fichier .xlsx avec en première ligne les colonnes <strong>Numéro</strong>, <strong>Libellé</strong>
        et <strong>Classe</strong> (optionnelle, déduite du 1er chiffre du numéro si absente).
        Les comptes du fichier sont créés ou mis à jour ; les comptes existants non présents dans le fichier sont conservés.
      </p>
      <div class="form-row">
        <input ref="fichierInput" type="file" accept=".xlsx" @change="onFichierChange" />
        <button class="btn" @click="importerExcel" :disabled="!fichierExcel || importing">
          {{ importing ? 'Import en cours...' : 'Importer' }}
        </button>
      </div>
    </div>

    <div class="card">
      <h2>Ajouter un compte</h2>
      <div class="form-row">
        <label>
          Numéro
          <input v-model="nouveauCompte.numero" type="text" placeholder="ex: 6285" />
        </label>
        <label>
          Libellé
          <input v-model="nouveauCompte.libelle" type="text" placeholder="ex: Frais internet" />
        </label>
        <label>
          Classe
          <select v-model="nouveauCompte.classe">
            <option v-for="n in 8" :key="n" :value="n">Classe {{ n }}</option>
          </select>
        </label>
        <button class="btn" @click="ajouterCompte" :disabled="!nouveauCompte.numero || !nouveauCompte.libelle">
          Ajouter
        </button>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <label>
          Rechercher
          <input v-model="search" type="text" placeholder="numéro ou libellé" />
        </label>
      </div>

      <table v-if="comptesFiltres.length" class="table-cards">
        <thead>
          <tr>
            <th>Numéro</th>
            <th>Libellé</th>
            <th>Classe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comptesFiltres" :key="c.numero">
            <td data-label="Numéro">{{ c.numero }}</td>
            <td data-label="Libellé">{{ c.libelle }}</td>
            <td data-label="Classe">{{ c.classe }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Aucun compte trouvé.</p>
    </div>
  </div>
</template>
