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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// L'exercice est l'année civile (la clôture passe ses écritures au 31/12, les à-nouveaux au
// 01/01) : une écriture datée d'une autre année fausserait les états des deux exercices.
function validateDateExercice(date, exercice) {
  if (!DATE_RE.test(String(date || '')) || Number.isNaN(Date.parse(date))) {
    return 'Date invalide (format attendu AAAA-MM-JJ)';
  }
  if (Number(date.slice(0, 4)) !== Number(exercice)) {
    return `La date ${date} n'appartient pas à l'exercice ${exercice}`;
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
// `pieceRef` : référence de la pièce justificative (n° de facture fournisseur, de reçu…), exigée
// par l'auditeur pour retrouver le document papier. `source` : origine automatique (ex.
// "cookafrica:ventes:2026-11-05"), qui empêche d'importer deux fois la même opération.
async function createEcriture({ societeId, journalCode, date, libelle, lignes, exercice, createdBy, pieceRef, source }) {
  const erreurDate = validateDateExercice(date, exercice);
  if (erreurDate) {
    throw new Error(erreurDate);
  }

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
    ...(pieceRef ? { pieceRef: String(pieceRef).trim().slice(0, 60) } : {}),
    ...(source ? { source } : {}),
    createdBy,
    createdAt: new Date().toISOString(),
  };

  const ref = await db.collection('ecritures').add(ecriture);
  return { id: ref.id, ...ecriture };
}

// Annule une écriture par une écriture inverse (débit/crédit permutés) et marque l'originale.
// Seul moyen d'annuler une écriture comptabilisée. Erreur `code: 404 | 409` exploitable par les routes.
async function extournerEcriture({ societeId, id, date, journalCode, createdBy, motif }) {
  const ref = db.collection('ecritures').doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data().societeId !== societeId) {
    throw Object.assign(new Error('Écriture introuvable'), { code: 404 });
  }
  const originale = doc.data();
  if (originale.extourneeParId) {
    throw Object.assign(new Error('Cette écriture a déjà été extournée'), { code: 409 });
  }
  const dateExtourne = date || new Date().toISOString().slice(0, 10);
  const ecriture = await createEcriture({
    societeId,
    journalCode: journalCode || originale.journalCode,
    date: dateExtourne,
    libelle: `Extourne ${originale.journalCode}-${originale.numero} - ${originale.libelle}${motif ? ` (${motif})` : ''}`,
    exercice: Number(dateExtourne.slice(0, 4)),
    createdBy,
    pieceRef: originale.pieceRef,
    lignes: originale.lignes.map(l => ({
      compte: l.compte,
      libelle: l.libelle || originale.libelle,
      debit: l.credit,
      credit: l.debit,
    })),
  });
  await ref.update({ extourneeParId: ecriture.id, extourneeLe: new Date().toISOString() });
  return ecriture;
}

module.exports = {
  extournerEcriture,
  round2,
  validateLignes,
  validateDateExercice,
  checkComptesExist,
  getNextNumero,
  createEcriture,
  isExerciceClos,
};
