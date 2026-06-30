const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2 } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

async function getMouvementsCompte(societeId, compte) {
  const snap = await db.collection('ecritures').where('societeId', '==', societeId).get();

  const mouvements = [];
  for (const doc of snap.docs) {
    const ec = doc.data();
    ec.lignes.forEach((ligne, ligneIndex) => {
      if (ligne.compte !== compte) return;
      mouvements.push({
        ecritureId: doc.id,
        ligneIndex,
        date: ec.date,
        journalCode: ec.journalCode,
        numero: ec.numero,
        libelle: ligne.libelle || ec.libelle,
        debit: ligne.debit,
        credit: ligne.credit,
        pointe: ligne.pointe || false,
      });
    });
  }

  return mouvements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.numero - b.numero));
}

// GET /api/rapprochement/:societeId/:compte?dateFin=YYYY-MM-DD
// Le pointage est purement déclaratif (comme le lettrage) : il ne modifie jamais le débit/crédit
// d'une ligne, donc reste autorisé même sur un exercice clôturé.
router.get('/:societeId/:compte', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte } = req.params;
    const { dateFin } = req.query;

    let mouvements = await getMouvementsCompte(societeId, compte);
    if (dateFin) mouvements = mouvements.filter(m => m.date <= dateFin);

    const soldeComptable = round2(mouvements.reduce((s, m) => s + m.debit - m.credit, 0));
    const soldeNonPointe = round2(mouvements.filter(m => !m.pointe).reduce((s, m) => s + m.debit - m.credit, 0));
    const soldeTheoriqueReleve = round2(soldeComptable - soldeNonPointe);

    res.json({ mouvements, soldeComptable, soldeNonPointe, soldeTheoriqueReleve });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/rapprochement/:societeId/:compte/pointer — bascule le pointage d'une ligne
router.post('/:societeId/:compte/pointer', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte } = req.params;
    const { ecritureId, ligneIndex, pointe } = req.body;

    if (!ecritureId || ligneIndex === undefined) {
      return res.status(400).json({ error: 'ecritureId et ligneIndex requis' });
    }

    const ref = db.collection('ecritures').doc(ecritureId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().societeId !== societeId) {
      return res.status(404).json({ error: 'Écriture introuvable' });
    }

    const lignes = [...doc.data().lignes];
    const ligne = lignes[ligneIndex];
    if (!ligne || ligne.compte !== compte) {
      return res.status(400).json({ error: 'Ligne invalide' });
    }

    lignes[ligneIndex] = { ...ligne, pointe: !!pointe };
    await ref.update({ lignes });

    res.json({ message: pointe ? 'Ligne pointée' : 'Pointage retiré' });
  } catch (err) {
    console.error('Pointer error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
