const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { getPointages } = require('../utils/gestionEmployeesClient');

const router = express.Router({ mergeParams: true });

// GET /api/pointages/:societeId?periode=YYYY-MM — pointages réels (scan QR), en lecture seule.
// Source de vérité : App-Gestion-Employees. Plus de saisie/correction manuelle ici.
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { periode } = req.query;
    const pointages = await getPointages(societeId, periode);
    res.json(pointages);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
