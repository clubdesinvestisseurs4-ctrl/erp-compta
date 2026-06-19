const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2 } = require('../utils/ecritures');

const router = express.Router({ mergeParams: true });

// Conversion 1, 2, ... 26, 27 -> A, B, ... Z, AA (même principe que les colonnes d'un tableur).
function numeroToLettre(n) {
  let s = '';
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function getNextLettre(societeId, compte) {
  const counterRef = db.collection('compteurs_lettrage').doc(`${societeId}_${compte}`);
  const numero = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = (doc.exists ? doc.data().dernierNumero : 0) + 1;
    tx.set(counterRef, { societeId, compte, dernierNumero: next });
    return next;
  });
  return numeroToLettre(numero);
}

// Lettrage purement déclaratif : il ne modifie ni le débit/crédit ni le compte d'une ligne,
// donc reste autorisé même sur un exercice clôturé (une facture close peut être réglée plus tard).
async function appliquerLettre(societeId, ecritureId, ligneIndex, lettre) {
  const ref = db.collection('ecritures').doc(ecritureId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().societeId !== societeId) {
    throw new Error(`Écriture ${ecritureId} introuvable`);
  }
  const lignes = [...doc.data().lignes];
  if (!lignes[ligneIndex]) {
    throw new Error(`Ligne introuvable sur l'écriture ${doc.data().journalCode}-${doc.data().numero}`);
  }
  lignes[ligneIndex] = { ...lignes[ligneIndex], lettre };
  await ref.update({ lignes });
}

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
        lettre: ligne.lettre || null,
      });
    });
  }

  return mouvements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.numero - b.numero));
}

// GET /api/lettrage/:societeId/:compte — tous les mouvements du compte (lettrés et non lettrés)
router.get('/:societeId/:compte', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte } = req.params;
    const mouvements = await getMouvementsCompte(societeId, compte);
    res.json(mouvements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lettrage/:societeId/:compte — lettrage manuel d'une sélection de mouvements équilibrée
router.post('/:societeId/:compte', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte } = req.params;
    const { mouvements } = req.body;

    if (!Array.isArray(mouvements) || mouvements.length < 2) {
      return res.status(400).json({ error: 'Sélectionnez au moins 2 mouvements à lettrer' });
    }

    const lignesSelectionnees = [];
    for (const m of mouvements) {
      const ref = db.collection('ecritures').doc(m.ecritureId);
      const doc = await ref.get();
      if (!doc.exists || doc.data().societeId !== societeId) {
        return res.status(404).json({ error: `Écriture ${m.ecritureId} introuvable` });
      }
      const ecriture = doc.data();
      const ligne = ecriture.lignes[m.ligneIndex];
      if (!ligne || ligne.compte !== compte) {
        return res.status(400).json({ error: `Ligne invalide sur l'écriture ${ecriture.journalCode}-${ecriture.numero}` });
      }
      if (ligne.lettre) {
        return res.status(409).json({ error: `La ligne de l'écriture ${ecriture.journalCode}-${ecriture.numero} est déjà lettrée (${ligne.lettre})` });
      }
      lignesSelectionnees.push({ ecritureId: m.ecritureId, ligneIndex: m.ligneIndex, debit: ligne.debit, credit: ligne.credit });
    }

    const solde = round2(lignesSelectionnees.reduce((s, l) => s + l.debit - l.credit, 0));
    if (solde !== 0) {
      return res.status(400).json({ error: `Sélection déséquilibrée (écart de ${solde}) : le lettrage doit solder exactement débit et crédit` });
    }

    const lettre = await getNextLettre(societeId, compte);
    for (const l of lignesSelectionnees) {
      await appliquerLettre(societeId, l.ecritureId, l.ligneIndex, lettre);
    }

    const montant = round2(lignesSelectionnees.reduce((s, l) => s + l.debit, 0));
    await db.collection('lettrages').doc(`${societeId}_${compte}_${lettre}`).set({
      societeId,
      compte,
      lettre,
      mouvements: lignesSelectionnees.map(l => ({ ecritureId: l.ecritureId, ligneIndex: l.ligneIndex })),
      montant,
      automatique: false,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    });

    res.json({ message: `Lettre ${lettre} attribuée`, lettre });
  } catch (err) {
    console.error('Lettrage error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/lettrage/:societeId/:compte/auto — lettrage automatique des correspondances exactes 1 pour 1
router.post('/:societeId/:compte/auto', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte } = req.params;
    const mouvements = await getMouvementsCompte(societeId, compte);

    const debits = mouvements.filter(m => !m.lettre && m.debit > 0);
    const credits = mouvements.filter(m => !m.lettre && m.credit > 0);
    const debitsUtilises = new Set();

    let nbLettrages = 0;
    for (const credit of credits) {
      const debit = debits.find(d => !debitsUtilises.has(d) && d.debit === credit.credit);
      if (!debit) continue;
      debitsUtilises.add(debit);

      const lettre = await getNextLettre(societeId, compte);
      await appliquerLettre(societeId, debit.ecritureId, debit.ligneIndex, lettre);
      await appliquerLettre(societeId, credit.ecritureId, credit.ligneIndex, lettre);
      await db.collection('lettrages').doc(`${societeId}_${compte}_${lettre}`).set({
        societeId,
        compte,
        lettre,
        mouvements: [
          { ecritureId: debit.ecritureId, ligneIndex: debit.ligneIndex },
          { ecritureId: credit.ecritureId, ligneIndex: credit.ligneIndex },
        ],
        montant: credit.credit,
        automatique: true,
        createdBy: req.user.username,
        createdAt: new Date().toISOString(),
      });
      nbLettrages++;
    }

    res.json({ message: `${nbLettrages} lettrage(s) automatique(s) effectué(s)`, nbLettrages });
  } catch (err) {
    console.error('Auto-lettrage error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/lettrage/:societeId/:compte/:lettre — annule un lettrage (les écritures ne sont pas touchées)
router.delete('/:societeId/:compte/:lettre', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, compte, lettre } = req.params;
    const ref = db.collection('lettrages').doc(`${societeId}_${compte}_${lettre}`);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Lettrage introuvable' });
    }

    for (const m of doc.data().mouvements) {
      await appliquerLettre(societeId, m.ecritureId, m.ligneIndex, null);
    }
    await ref.delete();

    res.json({ message: `Lettrage ${lettre} annulé` });
  } catch (err) {
    console.error('Delettrage error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
