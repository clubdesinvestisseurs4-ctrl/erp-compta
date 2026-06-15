const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2, createEcriture } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

const COMPTE_CHARGE_SALAIRE = '661';
const COMPTE_PERSONNEL_DU = '422';

function dernierJourMois(periode) {
  const [annee, mois] = periode.split('-').map(Number);
  const dernierJour = new Date(annee, mois, 0).getDate();
  return `${periode}-${String(dernierJour).padStart(2, '0')}`;
}

// GET /api/paie/:societeId?periode=YYYY-MM
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { periode } = req.query;

    let query = db.collection('fiches_paie').where('societeId', '==', societeId);
    if (periode) query = query.where('periode', '==', periode);

    const snap = await query.get();
    const fiches = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.periode < b.periode ? 1 : a.periode > b.periode ? -1 : a.employeNom.localeCompare(b.employeNom)));

    res.json(fiches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/paie/:societeId/:id — détail d'une fiche de paie pour le bulletin
router.get('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('fiches_paie').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Fiche de paie introuvable' });
    }
    const fiche = { id: doc.id, ...doc.data() };

    const [employeDoc, societeDoc] = await Promise.all([
      db.collection('employes').doc(fiche.employeId).get(),
      db.collection('societes').doc(societeId).get(),
    ]);

    res.json({
      fiche,
      employe: employeDoc.exists ? employeDoc.data() : null,
      societe: societeDoc.exists ? societeDoc.data() : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/paie/:societeId/generer — génère les fiches de paie de la période à partir des pointages
router.post('/:societeId/generer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { periode } = req.body;

    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
      return res.status(400).json({ error: 'periode requise au format YYYY-MM' });
    }

    const pointagesSnap = await db.collection('pointages').where('societeId', '==', societeId).get();
    const heuresParEmploye = new Map();
    for (const doc of pointagesSnap.docs) {
      const p = doc.data();
      if (!p.date.startsWith(periode)) continue;
      const cumul = heuresParEmploye.get(p.employeId) || 0;
      heuresParEmploye.set(p.employeId, round2(cumul + p.heures));
    }

    if (heuresParEmploye.size === 0) {
      return res.json({ message: 'Aucun pointage pour cette période', fiches: [] });
    }

    const existantesSnap = await db.collection('fiches_paie')
      .where('societeId', '==', societeId)
      .where('periode', '==', periode)
      .get();
    const employesAvecFiche = new Set(existantesSnap.docs.map(d => d.data().employeId));

    const employeIds = [...heuresParEmploye.keys()].filter(id => !employesAvecFiche.has(id));
    if (employeIds.length === 0) {
      return res.json({ message: 'Toutes les fiches de paie existent déjà pour cette période', fiches: [] });
    }

    const employeRefs = employeIds.map(id => db.collection('employes').doc(id));
    const employeDocs = await db.getAll(...employeRefs);

    const fiches = [];
    const batch = db.batch();
    for (const empDoc of employeDocs) {
      if (!empDoc.exists) continue;
      const employe = empDoc.data();
      const heures = heuresParEmploye.get(empDoc.id);
      const salaire = round2(heures * employe.tauxHoraire);

      const fiche = {
        societeId,
        employeId: empDoc.id,
        employeNom: `${employe.prenom} ${employe.nom}`,
        periode,
        heures,
        tauxHoraire: employe.tauxHoraire,
        salaire,
        statut: 'brouillon',
        ecritureId: null,
        ecriturePaiementId: null,
        createdAt: new Date().toISOString(),
      };

      const ref = db.collection('fiches_paie').doc();
      batch.set(ref, fiche);
      fiches.push({ id: ref.id, ...fiche });
    }
    await batch.commit();

    res.json({ message: `${fiches.length} fiche(s) de paie générée(s)`, fiches });
  } catch (err) {
    console.error('Generer paie error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/paie/:societeId/:id/valider — comptabilise la fiche (661 / 422)
router.post('/:societeId/:id/valider', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('fiches_paie').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Fiche de paie introuvable' });
    }
    const fiche = doc.data();
    if (fiche.statut !== 'brouillon') {
      return res.status(409).json({ error: 'Cette fiche a déjà été validée' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode: 'OD',
        date: dernierJourMois(fiche.periode),
        libelle: `Salaire ${fiche.periode} - ${fiche.employeNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: [
          { compte: COMPTE_CHARGE_SALAIRE, libelle: `Salaire ${fiche.periode} - ${fiche.employeNom}`, debit: fiche.salaire, credit: 0 },
          { compte: COMPTE_PERSONNEL_DU, libelle: `Salaire ${fiche.periode} - ${fiche.employeNom}`, debit: 0, credit: fiche.salaire },
        ],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'validee', ecritureId: ecriture.id });
    res.json({ message: 'Fiche de paie validée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Valider paie error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/paie/:societeId/:id/payer — comptabilise le paiement (422 / trésorerie)
router.post('/:societeId/:id/payer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { compteTresorerie, date } = req.body;

    if (!compteTresorerie) {
      return res.status(400).json({ error: 'compteTresorerie requis' });
    }

    const ref = db.collection('fiches_paie').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Fiche de paie introuvable' });
    }
    const fiche = doc.data();
    if (fiche.statut !== 'validee') {
      return res.status(409).json({ error: 'La fiche doit être validée avant le paiement' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;

    const journalCode = String(compteTresorerie).startsWith('57') ? 'CA' : 'BQ';
    const datePaiement = date || dernierJourMois(fiche.periode);

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode,
        date: datePaiement,
        libelle: `Paiement salaire ${fiche.periode} - ${fiche.employeNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: [
          { compte: COMPTE_PERSONNEL_DU, libelle: `Paiement salaire ${fiche.periode} - ${fiche.employeNom}`, debit: fiche.salaire, credit: 0 },
          { compte: String(compteTresorerie), libelle: `Paiement salaire ${fiche.periode} - ${fiche.employeNom}`, debit: 0, credit: fiche.salaire },
        ],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'payee', ecriturePaiementId: ecriture.id });
    res.json({ message: 'Paiement comptabilisé', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Payer paie error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/paie/:societeId/:id — supprime une fiche en brouillon
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('fiches_paie').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Fiche de paie introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seules les fiches en brouillon peuvent être supprimées' });
    }
    await ref.delete();
    res.json({ message: 'Fiche de paie supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
