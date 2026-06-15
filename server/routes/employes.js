const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/employes — liste des employés actifs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const snap = await db.collection('employes').where('actif', '==', true).get();
    const employes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
    res.json(employes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employes — crée un employé (admin)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { nom, prenom, poste, tauxHoraire, societesAccess } = req.body;

    if (!nom || !prenom || !tauxHoraire || !Array.isArray(societesAccess) || societesAccess.length === 0) {
      return res.status(400).json({ error: 'nom, prenom, tauxHoraire et societesAccess sont requis' });
    }
    if (Number(tauxHoraire) <= 0) {
      return res.status(400).json({ error: 'tauxHoraire doit être positif' });
    }

    const employe = {
      nom,
      prenom,
      poste: poste || '',
      tauxHoraire: Number(tauxHoraire),
      societesAccess,
      actif: true,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('employes').add(employe);
    res.status(201).json({ id: ref.id, ...employe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employes/:id — modifie un employé (admin)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { nom, prenom, poste, tauxHoraire, societesAccess } = req.body;
    const ref = db.collection('employes').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Employé introuvable' });
    }

    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (prenom !== undefined) update.prenom = prenom;
    if (poste !== undefined) update.poste = poste;
    if (tauxHoraire !== undefined) {
      if (Number(tauxHoraire) <= 0) {
        return res.status(400).json({ error: 'tauxHoraire doit être positif' });
      }
      update.tauxHoraire = Number(tauxHoraire);
    }
    if (societesAccess !== undefined) update.societesAccess = societesAccess;

    await ref.update(update);
    res.json({ message: 'Employé mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employes/:id — désactive un employé (admin), refusé si des fiches de paie existent
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const ref = db.collection('employes').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Employé introuvable' });
    }

    const fiches = await db.collection('fiches_paie').where('employeId', '==', req.params.id).limit(1).get();
    if (!fiches.empty) {
      return res.status(409).json({ error: 'Impossible de supprimer : des fiches de paie existent pour cet employé' });
    }

    await ref.update({ actif: false });
    res.json({ message: 'Employé désactivé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
