const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

const JOURNAUX_DEFAULT = [
  { code: 'AC', libelle: 'Journal des Achats' },
  { code: 'VE', libelle: 'Journal des Ventes' },
  { code: 'BQ', libelle: 'Journal de Banque' },
  { code: 'CA', libelle: 'Journal de Caisse' },
  { code: 'OD', libelle: 'Journal des Opérations Diverses' },
  { code: 'AN', libelle: 'Journal des À-Nouveaux' },
];

function docId(societeId, code) {
  return `${societeId}_${code}`;
}

// GET /api/journaux/:societeId
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const snap = await db.collection('journaux')
      .where('societeId', '==', req.params.societeId)
      .get();

    const journaux = snap.docs.map(d => d.data())
      .sort((a, b) => a.code.localeCompare(b.code));

    res.json(journaux);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/journaux/:societeId/seed — crée les journaux par défaut pour la société
router.post('/:societeId/seed', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;

    const existing = await db.collection('journaux')
      .where('societeId', '==', societeId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Journaux déjà initialisés pour cette société' });
    }

    const batch = db.batch();
    for (const j of JOURNAUX_DEFAULT) {
      const ref = db.collection('journaux').doc(docId(societeId, j.code));
      batch.set(ref, { societeId, ...j });
    }
    await batch.commit();

    res.json({ message: 'Journaux créés', count: JOURNAUX_DEFAULT.length });
  } catch (err) {
    console.error('Seed journaux error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
