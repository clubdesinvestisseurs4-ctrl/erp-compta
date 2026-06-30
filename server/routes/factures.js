const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2, createEcriture } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

function validerLignes(lignes) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return 'Au moins une ligne est requise';
  }
  for (const l of lignes) {
    if (!l.compte || !(Number(l.montant) > 0)) {
      return 'Chaque ligne doit avoir un compte de produit et un montant positif';
    }
  }
  return null;
}

function normaliserLignes(lignes) {
  return lignes.map(l => ({
    compte: String(l.compte),
    libelle: l.libelle || '',
    montant: round2(l.montant),
  }));
}

async function getNextNumeroFacture(societeId) {
  const counterRef = db.collection('compteurs_factures').doc(societeId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = (doc.exists ? doc.data().dernierNumero : 0) + 1;
    tx.set(counterRef, { societeId, dernierNumero: next });
    return `FV-${String(next).padStart(4, '0')}`;
  });
}

async function getClient(societeId, clientId) {
  const doc = await db.collection('tiers').doc(clientId).get();
  if (!doc.exists || doc.data().societeId !== societeId || doc.data().type !== 'client') {
    return null;
  }
  return doc.data();
}

// GET /api/factures/:societeId?statut=...
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { statut } = req.query;

    let query = db.collection('factures_vente').where('societeId', '==', societeId);
    if (statut) query = query.where('statut', '==', statut);

    const snap = await query.get();
    const factures = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.numero.localeCompare(b.numero)));

    res.json(factures);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/factures/:societeId/:id
router.get('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const doc = await db.collection('factures_vente').doc(id).get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/factures/:societeId — crée une facture de vente en brouillon
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { clientId, date, lignes } = req.body;

    if (!clientId) return res.status(400).json({ error: 'clientId requis' });
    if (!date) return res.status(400).json({ error: 'date requise' });

    const erreurLignes = validerLignes(lignes);
    if (erreurLignes) return res.status(400).json({ error: erreurLignes });

    const client = await getClient(societeId, clientId);
    if (!client) return res.status(400).json({ error: 'Client introuvable' });

    const lignesNormalisees = normaliserLignes(lignes);
    const montantTotal = round2(lignesNormalisees.reduce((s, l) => s + l.montant, 0));
    const numero = await getNextNumeroFacture(societeId);

    const facture = {
      societeId,
      numero,
      clientId,
      clientNom: client.nom,
      clientCompte: client.compteNumero,
      date,
      lignes: lignesNormalisees,
      montantTotal,
      statut: 'brouillon',
      ecritureFactureId: null,
      ecritureEncaissementId: null,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('factures_vente').add(facture);
    res.status(201).json({ id: ref.id, ...facture });
  } catch (err) {
    console.error('Create facture error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/factures/:societeId/:id — modifie une facture en brouillon
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { clientId, date, lignes } = req.body;

    const ref = db.collection('factures_vente').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seules les factures en brouillon peuvent être modifiées' });
    }

    const update = {};
    if (date !== undefined) update.date = date;

    if (clientId !== undefined) {
      const client = await getClient(societeId, clientId);
      if (!client) return res.status(400).json({ error: 'Client introuvable' });
      update.clientId = clientId;
      update.clientNom = client.nom;
      update.clientCompte = client.compteNumero;
    }

    if (lignes !== undefined) {
      const erreurLignes = validerLignes(lignes);
      if (erreurLignes) return res.status(400).json({ error: erreurLignes });
      update.lignes = normaliserLignes(lignes);
      update.montantTotal = round2(update.lignes.reduce((s, l) => s + l.montant, 0));
    }

    await ref.update(update);
    res.json({ message: 'Facture mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/factures/:societeId/:id/valider — confirme la facture (aucune écriture : pas encore émise)
router.post('/:societeId/:id/valider', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('factures_vente').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Cette facture a déjà été validée' });
    }

    await ref.update({ statut: 'validee' });
    res.json({ message: 'Facture validée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/factures/:societeId/:id/facturer — comptabilise l'émission (411 client / comptes de produit)
router.post('/:societeId/:id/facturer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { date } = req.body;

    const ref = db.collection('factures_vente').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    const facture = doc.data();
    if (facture.statut !== 'validee') {
      return res.status(409).json({ error: 'La facture doit être validée avant d\'être émise' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;
    const dateFacture = date || new Date().toISOString().slice(0, 10);

    const lignesEcriture = [
      {
        compte: facture.clientCompte,
        libelle: `Facture ${facture.numero} - ${facture.clientNom}`,
        debit: facture.montantTotal,
        credit: 0,
      },
      ...facture.lignes.map(l => ({
        compte: l.compte,
        libelle: l.libelle || `Facture ${facture.numero} - ${facture.clientNom}`,
        debit: 0,
        credit: l.montant,
      })),
    ];

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode: 'VE',
        date: dateFacture,
        libelle: `Facture ${facture.numero} - ${facture.clientNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: lignesEcriture,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'facturee', ecritureFactureId: ecriture.id, dateFacture });
    res.json({ message: 'Facture émise et comptabilisée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Facturer error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/factures/:societeId/:id/encaisser — comptabilise l'encaissement (trésorerie / 411 client)
router.post('/:societeId/:id/encaisser', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { compteTresorerie, date } = req.body;

    if (!compteTresorerie) {
      return res.status(400).json({ error: 'compteTresorerie requis' });
    }

    const ref = db.collection('factures_vente').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    const facture = doc.data();
    if (facture.statut !== 'facturee') {
      return res.status(409).json({ error: 'La facture doit être émise avant l\'encaissement' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;

    const journalCode = String(compteTresorerie).startsWith('57') ? 'CA' : 'BQ';
    const dateEncaissement = date || new Date().toISOString().slice(0, 10);

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode,
        date: dateEncaissement,
        libelle: `Encaissement ${facture.numero} - ${facture.clientNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: [
          { compte: String(compteTresorerie), libelle: `Encaissement ${facture.numero} - ${facture.clientNom}`, debit: facture.montantTotal, credit: 0 },
          { compte: facture.clientCompte, libelle: `Encaissement ${facture.numero} - ${facture.clientNom}`, debit: 0, credit: facture.montantTotal },
        ],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'encaissee', ecritureEncaissementId: ecriture.id });
    res.json({ message: 'Encaissement comptabilisé', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Encaisser error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/factures/:societeId/:id — supprime une facture en brouillon
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('factures_vente').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Facture introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seules les factures en brouillon peuvent être supprimées' });
    }
    await ref.delete();
    res.json({ message: 'Facture supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
