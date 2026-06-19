const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { simulerCloture, executerCloture } = require('../utils/cloture');

const router = express.Router({ mergeParams: true });

// GET /api/cloture/:societeId/simuler?exercice=YYYY — aperçu sans aucune écriture en base
router.get('/:societeId/simuler', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const apercu = await simulerCloture(societeId, exercice);
    res.json(apercu);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/cloture/:societeId/executer — clôture réelle et irréversible (admin uniquement)
router.post('/:societeId/executer', authenticateToken, requireSocieteAccess, requireRole('admin'), async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.body;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const resultat = await executerCloture(societeId, Number(exercice), req.user.username);
    res.json({ message: `Exercice ${exercice} clôturé`, ...resultat });
  } catch (err) {
    console.error('Executer cloture error:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
