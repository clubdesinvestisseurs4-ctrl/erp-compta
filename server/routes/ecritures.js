const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { createEcriture, isExerciceClos, extournerEcriture } = require('../utils/ecritures');

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
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
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
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/ecritures/:societeId — création d'une écriture
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { journalCode, date, libelle, lignes, exercice, pieceRef } = req.body;

    if (!journalCode || !date || !libelle || !exercice) {
      return res.status(400).json({ error: 'journalCode, date, libelle et exercice sont requis' });
    }

    const ecriture = await createEcriture({
      societeId, journalCode, date, libelle, lignes, exercice, pieceRef,
      createdBy: req.user.username,
    });

    res.status(201).json(ecriture);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/ecritures/:societeId/:id — modification du libellé uniquement (une écriture comptabilisée
// ne se corrige jamais sur ses lignes/montants : voir POST /:id/extourner pour annuler son effet).
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { libelle } = req.body;

    if (!libelle) {
      return res.status(400).json({ error: 'libelle requis' });
    }

    let ecriture;
    try {
      ecriture = await extournerEcriture({ societeId, id, date, journalCode, createdBy: req.user.username });
    } catch (err) {
      return res.status(err.code === 404 || err.code === 409 ? err.code : 400).json({ error: err.message });
    }
    res.json({ message: 'Écriture extournée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Extourner ecriture error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

