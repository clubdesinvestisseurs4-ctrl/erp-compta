const { db } = require('../firebase-admin');
const { round2, createEcriture } = require('./ecritures');

const COMPTE_BENEFICE = '120';
const COMPTE_PERTE = '129';

async function getSociete(societeId) {
  const doc = await db.collection('societes').doc(societeId).get();
  if (!doc.exists) throw new Error('Société introuvable');
  return doc.data();
}

async function getSoldesParCompte(societeId, exercice) {
  const snap = await db.collection('ecritures')
    .where('societeId', '==', societeId)
    .where('exercice', '==', Number(exercice))
    .get();

  const soldes = new Map();
  for (const doc of snap.docs) {
    for (const ligne of doc.data().lignes) {
      const s = soldes.get(ligne.compte) || 0;
      soldes.set(ligne.compte, round2(s + ligne.debit - ligne.credit));
    }
  }
  return soldes;
}

async function getPlanComptableMap(societeId) {
  const snap = await db.collection('plan_comptable').where('societeId', '==', societeId).get();
  const map = new Map();
  snap.docs.forEach(d => map.set(d.data().numero, d.data()));
  return map;
}

// Calcule tout ce qui est nécessaire pour clôturer un exercice, sans rien écrire en base.
// Utilisé à la fois par la simulation (aperçu) et par l'exécution réelle, pour garantir
// que les deux produisent exactement le même résultat.
async function calculerCloture(societeId, exercice) {
  const societe = await getSociete(societeId);
  const exercicesClotures = societe.exercicesClotures || [];
  if (exercicesClotures.includes(Number(exercice))) {
    throw new Error(`L'exercice ${exercice} est déjà clôturé`);
  }

  const [soldes, planComptable] = await Promise.all([
    getSoldesParCompte(societeId, exercice),
    getPlanComptableMap(societeId),
  ]);

  // Lignes de clôture du résultat : on solde chaque compte de charge (classe 6) et de produit (classe 7).
  const lignesResultat = [];
  let totalCharges = 0;
  let totalProduits = 0;
  for (const [numero, solde] of soldes.entries()) {
    if (solde === 0) continue;
    const compte = planComptable.get(numero);
    const classe = compte ? compte.classe : 0;
    if (classe !== 6 && classe !== 7) continue;

    if (classe === 6) totalCharges = round2(totalCharges + solde);
    if (classe === 7) totalProduits = round2(totalProduits - solde);

    lignesResultat.push({
      compte: numero,
      libelle: compte ? compte.libelle : numero,
      debit: solde < 0 ? -solde : 0,
      credit: solde > 0 ? solde : 0,
    });
  }

  const resultatNet = round2(totalProduits - totalCharges);
  const compteResultat = resultatNet > 0 ? COMPTE_BENEFICE : resultatNet < 0 ? COMPTE_PERTE : null;

  if (compteResultat) {
    lignesResultat.push({
      compte: compteResultat,
      libelle: `Résultat exercice ${exercice}`,
      debit: resultatNet < 0 ? -resultatNet : 0,
      credit: resultatNet > 0 ? resultatNet : 0,
    });
  }

  // Soldes de bilan après prise en compte du résultat, pour générer les à-nouveaux (classes 1 à 5).
  const soldesApresCloture = new Map(soldes);
  if (compteResultat) {
    soldesApresCloture.set(compteResultat, round2((soldesApresCloture.get(compteResultat) || 0) - resultatNet));
  }

  const lignesANouveaux = [];
  for (const [numero, solde] of soldesApresCloture.entries()) {
    if (solde === 0) continue;
    const compte = planComptable.get(numero);
    const classe = compte ? compte.classe : 0;
    if (classe < 1 || classe > 5) continue;

    lignesANouveaux.push({
      compte: numero,
      libelle: compte ? compte.libelle : numero,
      debit: solde > 0 ? solde : 0,
      credit: solde < 0 ? -solde : 0,
    });
  }

  const totalANDebit = round2(lignesANouveaux.reduce((s, l) => s + l.debit, 0));
  const totalANCredit = round2(lignesANouveaux.reduce((s, l) => s + l.credit, 0));
  if (totalANDebit !== totalANCredit) {
    throw new Error(`Les à-nouveaux calculés sont déséquilibrés (débit ${totalANDebit} ≠ crédit ${totalANCredit}) : vérifier le plan comptable et les comptes hors classes 1-7`);
  }

  return {
    exercice: Number(exercice),
    exerciceSuivant: Number(exercice) + 1,
    totalCharges,
    totalProduits,
    resultatNet,
    compteResultat,
    lignesResultat,
    lignesANouveaux,
    totalANDebit,
    totalANCredit,
  };
}

async function simulerCloture(societeId, exercice) {
  return calculerCloture(societeId, exercice);
}

async function executerCloture(societeId, exercice, createdBy) {
  const calcul = await calculerCloture(societeId, exercice);

  let ecritureClotureId = null;
  if (calcul.lignesResultat.length >= 2) {
    const ecriture = await createEcriture({
      societeId,
      journalCode: 'OD',
      date: `${calcul.exercice}-12-31`,
      libelle: `Détermination du résultat ${calcul.exercice}`,
      exercice: calcul.exercice,
      createdBy,
      lignes: calcul.lignesResultat,
    });
    ecritureClotureId = ecriture.id;
  }

  let ecritureAnId = null;
  if (calcul.lignesANouveaux.length >= 2) {
    const ecriture = await createEcriture({
      societeId,
      journalCode: 'AN',
      date: `${calcul.exerciceSuivant}-01-01`,
      libelle: `À-nouveaux ${calcul.exerciceSuivant}`,
      exercice: calcul.exerciceSuivant,
      createdBy,
      lignes: calcul.lignesANouveaux,
    });
    ecritureAnId = ecriture.id;
  }

  const societe = await getSociete(societeId);
  const exercicesClotures = [...(societe.exercicesClotures || []), calcul.exercice];
  const exerciceCourant = Math.max(societe.exerciceCourant || 0, calcul.exerciceSuivant);
  await db.collection('societes').doc(societeId).update({ exercicesClotures, exerciceCourant });

  return {
    exercice: calcul.exercice,
    exerciceSuivant: calcul.exerciceSuivant,
    resultatNet: calcul.resultatNet,
    compteResultat: calcul.compteResultat,
    ecritureClotureId,
    ecritureAnId,
  };
}

module.exports = { simulerCloture, executerCloture };
