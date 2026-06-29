const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getEmployes } = require('../utils/gestionEmployeesClient');

const router = express.Router();

// GET /api/employes?etablissement= — liste des employés (source de vérité : App-Gestion-Employees).
// La création/modification des employés se fait exclusivement dans cette autre application.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const employes = await getEmployes(req.query.etablissement);
    res.json(employes);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
