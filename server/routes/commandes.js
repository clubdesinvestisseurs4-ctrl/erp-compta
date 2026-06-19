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
      return 'Chaque ligne doit avoir un compte de charge et un montant positif';
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

async function getNextNumeroCommande(societeId) {
  const counterRef = db.collection('compteurs_commandes').doc(societeId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = (doc.exists ? doc.data().dernierNumero : 0) + 1;
    tx.set(counterRef, { societeId, dernierNumero: next });
    return `BC-${String(next).padStart(4, '0')}`;
  });
}

async function getFournisseur(societeId, fournisseurId) {
  const doc = await db.collection('tiers').doc(fournisseurId).get();
  if (!doc.exists || doc.data().societeId !== societeId || doc.data().type !== 'fournisseur') {
    return null;
  }
  return doc.data();
}

// GET /api/commandes/:societeId?statut=...
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { statut } = req.query;

    let query = db.collection('bons_commande').where('societeId', '==', societeId);
    if (statut) query = query.where('statut', '==', statut);

    const snap = await query.get();
    const commandes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.numero.localeCompare(b.numero)));

    res.json(commandes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/commandes/:societeId/:id
router.get('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const doc = await db.collection('bons_commande').doc(id).get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commandes/:societeId — crée un bon de commande en brouillon
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { fournisseurId, date, lignes } = req.body;

    if (!fournisseurId) return res.status(400).json({ error: 'fournisseurId requis' });
    if (!date) return res.status(400).json({ error: 'date requise' });

    const erreurLignes = validerLignes(lignes);
    if (erreurLignes) return res.status(400).json({ error: erreurLignes });

    const fournisseur = await getFournisseur(societeId, fournisseurId);
    if (!fournisseur) return res.status(400).json({ error: 'Fournisseur introuvable' });

    const lignesNormalisees = normaliserLignes(lignes);
    const montantTotal = round2(lignesNormalisees.reduce((s, l) => s + l.montant, 0));
    const numero = await getNextNumeroCommande(societeId);

    const commande = {
      societeId,
      numero,
      fournisseurId,
      fournisseurNom: fournisseur.nom,
      fournisseurCompte: fournisseur.compteNumero,
      date,
      lignes: lignesNormalisees,
      montantTotal,
      statut: 'brouillon',
      ecritureReceptionId: null,
      ecriturePaiementId: null,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('bons_commande').add(commande);
    res.status(201).json({ id: ref.id, ...commande });
  } catch (err) {
    console.error('Create commande error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/commandes/:societeId/:id — modifie un bon de commande en brouillon
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { fournisseurId, date, lignes } = req.body;

    const ref = db.collection('bons_commande').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seuls les bons en brouillon peuvent être modifiés' });
    }

    const update = {};
    if (date !== undefined) update.date = date;

    if (fournisseurId !== undefined) {
      const fournisseur = await getFournisseur(societeId, fournisseurId);
      if (!fournisseur) return res.status(400).json({ error: 'Fournisseur introuvable' });
      update.fournisseurId = fournisseurId;
      update.fournisseurNom = fournisseur.nom;
      update.fournisseurCompte = fournisseur.compteNumero;
    }

    if (lignes !== undefined) {
      const erreurLignes = validerLignes(lignes);
      if (erreurLignes) return res.status(400).json({ error: erreurLignes });
      update.lignes = normaliserLignes(lignes);
      update.montantTotal = round2(update.lignes.reduce((s, l) => s + l.montant, 0));
    }

    await ref.update(update);
    res.json({ message: 'Bon de commande mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commandes/:societeId/:id/valider — confirme le bon (aucune écriture : pas encore de dette)
router.post('/:societeId/:id/valider', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('bons_commande').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Ce bon de commande a déjà été validé' });
    }

    await ref.update({ statut: 'validee' });
    res.json({ message: 'Bon de commande validé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commandes/:societeId/:id/recevoir — comptabilise la réception (charges / 401 fournisseur)
router.post('/:societeId/:id/recevoir', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { date } = req.body;

    const ref = db.collection('bons_commande').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    const commande = doc.data();
    if (commande.statut !== 'validee') {
      return res.status(409).json({ error: 'Le bon de commande doit être validé avant la réception' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;
    const dateReception = date || new Date().toISOString().slice(0, 10);

    const lignesEcriture = [
      ...commande.lignes.map(l => ({
        compte: l.compte,
        libelle: l.libelle || `Achat ${commande.numero} - ${commande.fournisseurNom}`,
        debit: l.montant,
        credit: 0,
      })),
      {
        compte: commande.fournisseurCompte,
        libelle: `Achat ${commande.numero} - ${commande.fournisseurNom}`,
        debit: 0,
        credit: commande.montantTotal,
      },
    ];

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode: 'AC',
        date: dateReception,
        libelle: `Réception ${commande.numero} - ${commande.fournisseurNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: lignesEcriture,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'recue', ecritureReceptionId: ecriture.id, dateReception });
    res.json({ message: 'Réception comptabilisée', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Recevoir commande error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/commandes/:societeId/:id/payer — comptabilise le paiement (401 fournisseur / trésorerie)
router.post('/:societeId/:id/payer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { compteTresorerie, date } = req.body;

    if (!compteTresorerie) {
      return res.status(400).json({ error: 'compteTresorerie requis' });
    }

    const ref = db.collection('bons_commande').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    const commande = doc.data();
    if (commande.statut !== 'recue') {
      return res.status(409).json({ error: 'Le bon de commande doit être reçu avant le paiement' });
    }

    const societeDoc = await db.collection('societes').doc(societeId).get();
    const exercice = societeDoc.data().exerciceCourant;

    const journalCode = String(compteTresorerie).startsWith('57') ? 'CA' : 'BQ';
    const datePaiement = date || new Date().toISOString().slice(0, 10);

    let ecriture;
    try {
      ecriture = await createEcriture({
        societeId,
        journalCode,
        date: datePaiement,
        libelle: `Paiement ${commande.numero} - ${commande.fournisseurNom}`,
        exercice,
        createdBy: req.user.username,
        lignes: [
          { compte: commande.fournisseurCompte, libelle: `Paiement ${commande.numero} - ${commande.fournisseurNom}`, debit: commande.montantTotal, credit: 0 },
          { compte: String(compteTresorerie), libelle: `Paiement ${commande.numero} - ${commande.fournisseurNom}`, debit: 0, credit: commande.montantTotal },
        ],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ref.update({ statut: 'payee', ecriturePaiementId: ecriture.id });
    res.json({ message: 'Paiement comptabilisé', ecritureId: ecriture.id });
  } catch (err) {
    console.error('Payer commande error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/commandes/:societeId/:id — supprime un bon en brouillon
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('bons_commande').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Bon de commande introuvable' });
    }
    if (doc.data().statut !== 'brouillon') {
      return res.status(409).json({ error: 'Seuls les bons en brouillon peuvent être supprimés' });
    }
    await ref.delete();
    res.json({ message: 'Bon de commande supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
