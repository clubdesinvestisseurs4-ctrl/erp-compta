const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

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

// GET /api/ecritures/:societeId?journal=&exercice=
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { journal, exercice } = req.query;

    let query = db.collection('ecritures').where('societeId', '==', societeId);
    if (journal)  query = query.where('journalCode', '==', journal);
    if (exercice) query = query.where('exercice', '==', Number(exercice));

    const snap = await query.get();
    const ecritures = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.numero - a.numero));

    res.json(ecritures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ecritures/:societeId/:id
router.get('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const doc = await db.collection('ecritures').doc(req.params.id).get();
    if (!doc.exists || doc.data().societeId !== req.params.societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ecritures/:societeId — création d'une écriture
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { journalCode, date, libelle, lignes, exercice } = req.body;

    if (!journalCode || !date || !libelle || !exercice) {
      return res.status(400).json({ error: 'journalCode, date, libelle et exercice sont requis' });
    }

    const journalDoc = await db.collection('journaux').doc(`${societeId}_${journalCode}`).get();
    if (!journalDoc.exists) {
      return res.status(400).json({ error: 'Journal inconnu pour cette société' });
    }

    const erreur = validateLignes(lignes);
    if (erreur) {
      return res.status(400).json({ error: erreur });
    }

    const inconnus = await checkComptesExist(societeId, lignes);
    if (inconnus.length > 0) {
      return res.status(400).json({ error: `Comptes inconnus dans le plan comptable : ${inconnus.join(', ')}` });
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
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('ecritures').add(ecriture);
    res.status(201).json({ id: ref.id, ...ecriture });
  } catch (err) {
    console.error('Create ecriture error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/ecritures/:societeId/:id — modification (libellé et lignes, pas le numéro/journal)
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { date, libelle, lignes } = req.body;

    const ref = db.collection('ecritures').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }

    const erreur = validateLignes(lignes);
    if (erreur) {
      return res.status(400).json({ error: erreur });
    }

    const inconnus = await checkComptesExist(societeId, lignes);
    if (inconnus.length > 0) {
      return res.status(400).json({ error: `Comptes inconnus dans le plan comptable : ${inconnus.join(', ')}` });
    }

    const totalDebit = round2(lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0));
    const totalCredit = round2(lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0));

    const update = {
      libelle: libelle ?? doc.data().libelle,
      date: date ?? doc.data().date,
      lignes: lignes.map(l => ({
        compte: String(l.compte),
        libelle: l.libelle || '',
        debit: round2(l.debit || 0),
        credit: round2(l.credit || 0),
      })),
      totalDebit,
      totalCredit,
      updatedBy: req.user.username,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(update);
    res.json({ message: 'Écriture mise à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ecritures/:societeId/:id
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('ecritures').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }
    await ref.delete();
    res.json({ message: 'Écriture supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
