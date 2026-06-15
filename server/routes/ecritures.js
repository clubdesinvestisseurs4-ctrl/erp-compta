const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2, validateLignes, checkComptesExist, createEcriture } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

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

    const ecriture = await createEcriture({
      societeId, journalCode, date, libelle, lignes, exercice,
      createdBy: req.user.username,
    });

    res.status(201).json(ecriture);
  } catch (err) {
    if (err.message.includes('inconnu') || err.message.includes('Écriture') || err.message.includes('ligne') || err.message.includes('montants') || err.message.includes('nul')) {
      return res.status(400).json({ error: err.message });
    }
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

