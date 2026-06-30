const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

const BASE_COMPTE = { client: '411', fournisseur: '401' };

function docId(societeId, numero) {
  return `${societeId}_${numero}`;
}

// Génère le prochain numéro de sous-compte auxiliaire (ex: 411001, 401002...)
async function getNextCompteNumero(societeId, type) {
  const base = BASE_COMPTE[type];
  const counterRef = db.collection('compteurs_tiers').doc(`${societeId}_${type}`);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = (doc.exists ? doc.data().dernierNumero : 0) + 1;
    tx.set(counterRef, { societeId, type, dernierNumero: next });
    return `${base}${String(next).padStart(3, '0')}`;
  });
}

// GET /api/tiers/:societeId?type=client|fournisseur
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { type } = req.query;

    let query = db.collection('tiers').where('societeId', '==', societeId);
    if (type) query = query.where('type', '==', type);

    const snap = await query.get();
    const tiers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nom.localeCompare(b.nom));

    res.json(tiers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/tiers/:societeId — crée un tiers + son compte auxiliaire dans le plan comptable
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { type, nom, telephone, email, adresse } = req.body;

    if (!type || !BASE_COMPTE[type]) {
      return res.status(400).json({ error: 'type doit être "client" ou "fournisseur"' });
    }
    if (!nom) {
      return res.status(400).json({ error: 'nom requis' });
    }

    const compteNumero = await getNextCompteNumero(societeId, type);

    await db.collection('plan_comptable').doc(docId(societeId, compteNumero)).set({
      societeId,
      numero: compteNumero,
      libelle: nom,
      classe: 4,
    });

    const tiers = {
      societeId,
      type,
      nom,
      compteNumero,
      telephone: telephone || '',
      email: email || '',
      adresse: adresse || '',
      actif: true,
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection('tiers').add(tiers);
    res.status(201).json({ id: ref.id, ...tiers });
  } catch (err) {
    console.error('Create tiers error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/tiers/:societeId/:id
router.put('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const { nom, telephone, email, adresse } = req.body;

    const ref = db.collection('tiers').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Tiers introuvable' });
    }
    const tiers = doc.data();

    const update = {};
    if (nom !== undefined) update.nom = nom;
    if (telephone !== undefined) update.telephone = telephone;
    if (email !== undefined) update.email = email;
    if (adresse !== undefined) update.adresse = adresse;

    await ref.update(update);

    if (nom !== undefined && nom !== tiers.nom) {
      await db.collection('plan_comptable').doc(docId(societeId, tiers.compteNumero)).update({ libelle: nom });
    }

    res.json({ message: 'Tiers mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// DELETE /api/tiers/:societeId/:id — refusé si le compte auxiliaire a des mouvements
router.delete('/:societeId/:id', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, id } = req.params;
    const ref = db.collection('tiers').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Tiers introuvable' });
    }
    const tiers = doc.data();

    const ecrituresSnap = await db.collection('ecritures').where('societeId', '==', societeId).get();
    const utilise = ecrituresSnap.docs.some(d =>
      (d.data().lignes || []).some(l => l.compte === tiers.compteNumero)
    );
    if (utilise) {
      return res.status(409).json({ error: 'Impossible de supprimer : ce compte est utilisé dans des écritures' });
    }

    await ref.delete();
    await db.collection('plan_comptable').doc(docId(societeId, tiers.compteNumero)).delete();

    res.json({ message: 'Tiers supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
