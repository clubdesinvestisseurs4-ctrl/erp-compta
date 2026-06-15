const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const planComptableSyscohada = require('../data/planComptableSyscohada');

const router = express.Router({ mergeParams: true });

function docId(societeId, numero) {
  return `${societeId}_${numero}`;
}

// GET /api/comptes/:societeId — plan comptable de la société, trié par numéro
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const snap = await db.collection('plan_comptable')
      .where('societeId', '==', req.params.societeId)
      .get();

    const comptes = snap.docs.map(d => d.data())
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    res.json(comptes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/comptes/:societeId/seed — copie le référentiel SYSCOHADA pour la société
router.post('/:societeId/seed', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;

    const existing = await db.collection('plan_comptable')
      .where('societeId', '==', societeId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Plan comptable déjà initialisé pour cette société' });
    }

    const batches = [];
    let batch = db.batch();
    let count = 0;

    for (const compte of planComptableSyscohada) {
      const ref = db.collection('plan_comptable').doc(docId(societeId, compte.numero));
      batch.set(ref, { societeId, ...compte });
      count++;
      if (count % 400 === 0) {
        batches.push(batch.commit());
        batch = db.batch();
      }
    }
    batches.push(batch.commit());
    await Promise.all(batches);

    res.json({ message: 'Plan comptable SYSCOHADA initialisé', count: planComptableSyscohada.length });
  } catch (err) {
    console.error('Seed comptes error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/comptes/:societeId — ajoute un compte spécifique à la société
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { numero, libelle, classe } = req.body;

    if (!numero || !libelle || !classe) {
      return res.status(400).json({ error: 'numero, libelle et classe sont requis' });
    }

    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const existing = await ref.get();
    if (existing.exists) {
      return res.status(409).json({ error: 'Ce compte existe déjà' });
    }

    await ref.set({ societeId, numero: String(numero), libelle, classe: Number(classe) });
    res.status(201).json({ message: 'Compte créé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/comptes/:societeId/:numero — modifie le libellé d'un compte
router.put('/:societeId/:numero', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, numero } = req.params;
    const { libelle } = req.body;

    if (!libelle) {
      return res.status(400).json({ error: 'libelle requis' });
    }

    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    await ref.update({ libelle });
    res.json({ message: 'Compte mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comptes/:societeId/:numero
router.delete('/:societeId/:numero', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, numero } = req.params;
    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    await ref.delete();
    res.json({ message: 'Compte supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
