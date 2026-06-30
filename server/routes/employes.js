const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getEmployes } = require('../utils/gestionEmployeesClient');

const router = express.Router();

// GET /api/employes?etablissement= — liste des employés (source de vérité : App-Gestion-Employees).
// La création/modification des employés se fait exclusivement dans cette autre application.
router.get('/', authenticateToken, async (req, res) => {
  try {
    let employes = await getEmployes(req.query.etablissement);
    // Comme /api/societes : un non-admin ne voit que les employés des sociétés auxquelles il a accès
    // (requireSocieteAccess n'est pas applicable ici, la route ne prend pas :societeId en param).
    if (req.user.role !== 'admin') {
      const access = req.user.societesAccess || [];
      employes = employes.filter((e) => (e.etablissementsAccess || []).some((s) => access.includes(s)));
    }
    res.json(employes);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
