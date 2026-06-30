const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2, createEcriture } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

// Validation allégée par rapport à validateLignes() de utils/ecritures.js : un modèle peut
// stocker des lignes à 0 (montant variable, à saisir à chaque génération).
function validerLignes(lignes) {
  if (!Array.isArray(lignes) || lignes.length < 2) {
    return 'Un modèle doit comporter au moins 2 lignes';
  }
  for (const l of lignes) {
    if (!l.compte) return 'Chaque ligne doit référencer un compte';
    const debit = Number(l.debit) || 0;
    const credit = Number(l.credit) || 0;
    if (debit < 0 || credit < 0) return 'Les montants ne peuvent pas être négatifs';
    if (debit > 0 && credit > 0) return 'Une ligne ne peut pas être débitrice et créditrice à la fois';
  }
  return null;
}

function normaliserLignes(lignes) {
  return lignes.map(l => ({
    compte: String(l.compte),
    libelle: l.libelle || '',
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
  }));
}

// GET /api/modeles/:societeId
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const snap = await db.collection('modeles_ecriture').where('societeId', '==', societeId).get();
    const modeles = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nom.localeCompare(b.nom));
    res.json(modeles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/modeles/:societeId — crée un modèle d'écriture récurrente
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { nom, journalCode, lignes } = req.body;

    if (!nom) return res.status(400).json({ error: 'nom requis' });
    if (!journalCode) return res.status(400).json({ error: 'journalCode requis' });

    const erreur = validerLignes(lignes);
    if (erreur) return res.status(400).json({ error: erreur });

    const journalDoc = await db.collection('journaux').doc(`${societeId}_${journalCode}`).get();
    if (!journalDoc.exists) return res.status(400).json({ error: 'Journal inconnu pour cette société' });

    const modele = {
      societeId,
      nom,
      journalCode,
      lignes: normaliserLignes(lignes),
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('modeles_ecriture').add(modele);
    res.status(201).json({ id: ref.id, ...modele });
  } catch (err) {
    console.error('Create modele error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/modeles/:societeId/:id
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { nom, journalCode, lignes } = req.body;

    const ref = db.collection('modeles_ecriture').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Modèle introuvable' });
    }

    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (journalCode !== undefined) update.journalCode = journalCode;
    if (lignes !== undefined) {
      const erreur = validerLignes(lignes);
      if (erreur) return res.status(400).json({ error: erreur });
      update.lignes = normaliserLignes(lignes);
    }

    await ref.update(update);
    res.json({ message: 'Modèle mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// DELETE /api/modeles/:societeId/:id
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('modeles_ecriture').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Modèle introuvable' });
    }
    await ref.delete();
    res.json({ message: 'Modèle supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/modeles/:societeId/:id/generer — crée une vraie écriture comptabilisée à partir du modèle
router.post('/:societeId/:id/generer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { date, libelle, lignes } = req.body;

    if (!date) return res.status(400).json({ error: 'date requise' });

    const ref = db.collection('modeles_ecriture').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Modèle introuvable' });
    }
    const modele = doc.data();

    const lignesAGenerer = lignes !== undefined ? lignes : modele.lignes;
    const erreur = validerLignes(lignesAGenerer);
    if (erreur) return res.status(400).json({ error: erreur });

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode: modele.journalCode,
        date,
        libelle: libelle || modele.nom,
        exercice,
        createdBy: req.user.username,
        lignes: normaliserLignes(lignesAGenerer),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    res.json({ message: 'Écriture générée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Generer modele error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
