const { db } = require('../firebase-admin');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function validateLignes(lignes) {
  if (!Array.isArray(lignes) || lignes.length < 2) {
    return 'Une écriture doit comporter au moins 2 lignes';
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const ligne of lignes) {
    if (!ligne.compte) {
      return 'Chaque ligne doit référencer un compte';
    }
    const debit = round2(ligne.debit || 0);
    const credit = round2(ligne.credit || 0);

    if (debit < 0 || credit < 0) {
      return 'Les montants ne peuvent pas être négatifs';
    }
    if (debit > 0 && credit > 0) {
      return 'Une ligne ne peut pas être débitrice et créditrice à la fois';
    }
    if (debit === 0 && credit === 0) {
      return 'Chaque ligne doit avoir un montant débit ou crédit';
    }

    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
  }

  if (totalDebit !== totalCredit) {
    return `Écriture déséquilibrée : débit ${totalDebit} ≠ crédit ${totalCredit}`;
  }
  if (totalDebit === 0) {
    return 'Le montant total ne peut pas être nul';
  }

  return null;
}

async function checkComptesExist(societeId, lignes) {
  const numeros = [...new Set(lignes.map(l => String(l.compte)))];
  const refs = numeros.map(numero => db.collection('plan_comptable').doc(`${societeId}_${numero}`));
  const docs = await db.getAll(...refs);
  const inconnus = docs.filter(d => !d.exists).map(d => d.id.split('_').slice(1).join('_'));
  return inconnus;
}

// Numérotation séquentielle par société + journal + exercice (transaction sur un compteur)
async function getNextNumero(societeId, journalCode, exercice) {
  const counterRef = db.collection('compteurs_ecritures').doc(`${societeId}_${journalCode}_${exercice}`);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = (doc.exists ? doc.data().dernierNumero : 0) + 1;
    tx.set(counterRef, { societeId, journalCode, exercice, dernierNumero: next });
    return next;
  });
}

// Indique si l'exercice est clôturé pour la société (aucune écriture ne peut plus y être ajoutée).
async function isExerciceClos(societeId, exercice) {
  const societeDoc = await db.collection('societes').doc(societeId).get();
  const exercicesClotures = (societeDoc.exists && societeDoc.data().exercicesClotures) || [];
  return exercicesClotures.includes(Number(exercice));
}

// Crée une écriture comptable validée et numérotée. Lance une erreur si la validation échoue.
async function createEcriture({ societeId, journalCode, date, libelle, lignes, exercice, createdBy }) {
  const journalDoc = await db.collection('journaux').doc(`${societeId}_${journalCode}`).get();
  if (!journalDoc.exists) {
    throw new Error('Journal inconnu pour cette société');
  }

  if (await isExerciceClos(societeId, exercice)) {
    throw new Error(`L'exercice ${exercice} est clôturé : aucune écriture ne peut y être ajoutée`);
  }

  const erreur = validateLignes(lignes);
  if (erreur) {
    throw new Error(erreur);
  }

  const inconnus = await checkComptesExist(societeId, lignes);
  if (inconnus.length > 0) {
    throw new Error(`Comptes inconnus dans le plan comptable : ${inconnus.join(', ')}`);
  }

  const totalDebit = round2(lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0));

  const numero = await getNextNumero(societeId, journalCode, Number(exercice));

  const ecriture = {
    societeId,
    journalCode,
    numero,
    date,
    exercice: Number(exercice),
    libelle,
    lignes: lignes.map(l => ({
      compte: String(l.compte),
      libelle: l.libelle || '',
      debit: round2(l.debit || 0),
      credit: round2(l.credit || 0),
    })),
    totalDebit,
    totalCredit,
    createdBy,
    createdAt: new Date().toISOString(),
  };

  const ref = await db.collection('ecritures').add(ecriture);
  return { id: ref.id, ...ecriture };
}

module.exports = {
  round2,
  validateLignes,
  checkComptesExist,
  getNextNumero,
  createEcriture,
  isExerciceClos,
};
