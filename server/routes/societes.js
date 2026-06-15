const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const SOCIETES_DEFAULT = [
  { id: 'ohinene',   nom: 'Hôtel Ohinéné',   sigle: 'OHINENE',   devise: 'XOF', exerciceCourant: 2026 },
  { id: 'cookafrica', nom: 'Cook Africa',     sigle: 'COOKAFRICA', devise: 'XOF', exerciceCourant: 2026 },
];

// GET /api/societes — sociétés accessibles à l'utilisateur connecté
router.get('/', authenticateToken, async (req, res) => {
  try {
    const snap = await db.collection('societes').get();
    let societes = snap.docs.map(d => d.data());

    if (req.user.role !== 'admin') {
      const access = req.user.societesAccess || [];
      societes = societes.filter(s => access.includes(s.id));
    }

    res.json(societes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/societes/seed — crée les sociétés par défaut (Ohinéné, CookAfrica)
router.post('/seed', async (req, res) => {
  try {
    const snapshot = await db.collection('societes').limit(1).get();
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Sociétés déjà initialisées' });
    }

    const batch = db.batch();
    for (const s of SOCIETES_DEFAULT) {
      batch.set(db.collection('societes').doc(s.id), s);
    }
    await batch.commit();

    res.json({ message: 'Sociétés créées', count: SOCIETES_DEFAULT.length });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/societes/:id — mise à jour (admin uniquement)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { nom, sigle, devise, exerciceCourant } = req.body;
    const ref = db.collection('societes').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Société introuvable' });
    }

    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (sigle !== undefined) update.sigle = sigle;
    if (devise !== undefined) update.devise = devise;
    if (exerciceCourant !== undefined) update.exerciceCourant = exerciceCourant;

    await ref.update(update);
    res.json({ message: 'Société mise à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
