const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { createEcriture, isExerciceClos } = require('../utils/ecritures');

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

    const ref = db.collection('ecritures').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }

    if (await isExerciceClos(societeId, doc.data().exercice)) {
      return res.status(409).json({ error: `L'exercice ${doc.data().exercice} est clôturé : cette écriture est verrouillée` });
    }

    await ref.update({ libelle, updatedBy: req.user.username, updatedAt: new Date().toISOString() });
    res.json({ message: 'Libellé mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/ecritures/:societeId/:id/extourner — contre-passation : crée une écriture miroir
// (débit/crédit inversés) et marque l'originale comme extournée. Seul moyen d'annuler une écriture.
router.post('/:societeId/:id/extourner', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { date, journalCode } = req.body;

    const ref = db.collection('ecritures').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }
    const originale = doc.data();

    if (originale.extourneeParId) {
      return res.status(409).json({ error: 'Cette écriture a déjà été extournée' });
    }

    const dateExtourne = date || new Date().toISOString().slice(0, 10);
    const exerciceExtourne = Number(dateExtourne.slice(0, 4));

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode: journalCode || originale.journalCode,
        date: dateExtourne,
        libelle: `Extourne ${originale.journalCode}-${originale.numero} - ${originale.libelle}`,
        exercice: exerciceExtourne,
        createdBy: req.user.username,
        lignes: originale.lignes.map(l => ({
          compte: l.compte,
          libelle: l.libelle || originale.libelle,
          debit: l.credit,
          credit: l.debit,
        })),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ extourneeParId: ecriture.id, extourneeLe: new Date().toISOString() });
    res.json({ message: 'Écriture extournée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Extourner ecriture error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

