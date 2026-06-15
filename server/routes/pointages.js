const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

const HEURE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Calcule la durée en heures entre deux horaires HH:MM, en gérant les shifts de nuit (départ <= arrivée => +24h)
function calcHeures(heureArrivee, heureDepart) {
  const [h1, m1] = heureArrivee.split(':').map(Number);
  const [h2, m2] = heureDepart.split(':').map(Number);
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

// GET /api/pointages/:societeId?periode=YYYY-MM&employeId=
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { periode, employeId } = req.query;

    let query = db.collection('pointages').where('societeId', '==', societeId);
    if (employeId) query = query.where('employeId', '==', employeId);

    const snap = await query.get();
    let pointages = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (periode) {
      pointages = pointages.filter(p => p.date.startsWith(periode));
    }

    pointages.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    res.json(pointages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pointages/:societeId — enregistre un pointage (arrivée/départ)
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { employeId, date, heureArrivee, heureDepart } = req.body;

    if (!employeId || !date || !heureArrivee || !heureDepart) {
      return res.status(400).json({ error: 'employeId, date, heureArrivee et heureDepart sont requis' });
    }
    if (!HEURE_RE.test(heureArrivee) || !HEURE_RE.test(heureDepart)) {
      return res.status(400).json({ error: 'Format des heures invalide (attendu HH:MM)' });
    }

    const employeDoc = await db.collection('employes').doc(employeId).get();
    if (!employeDoc.exists) {
      return res.status(404).json({ error: 'Employé introuvable' });
    }
    const employe = employeDoc.data();
    if (!(employe.societesAccess || []).includes(societeId)) {
      return res.status(403).json({ error: 'Cet employé n\'a pas accès à cette société' });
    }

    const heures = calcHeures(heureArrivee, heureDepart);

    const pointage = {
      societeId,
      employeId,
      employeNom: `${employe.prenom} ${employe.nom}`,
      date,
      heureArrivee,
      heureDepart,
      heures,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('pointages').add(pointage);
    res.status(201).json({ id: ref.id, ...pointage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pointages/:societeId/:id
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('pointages').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Pointage introuvable' });
    }

    const periode = doc.data().date.slice(0, 7);
    const fiches = await db.collection('fiches_paie')
      .where('societeId', '==', societeId)
      .where('employeId', '==', doc.data().employeId)
      .where('periode', '==', periode)
      .limit(1)
      .get();
    if (!fiches.empty) {
      return res.status(409).json({ error: 'Impossible de supprimer : une fiche de paie existe déjà pour cette période' });
    }

    await ref.delete();
    res.json({ message: 'Pointage supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
