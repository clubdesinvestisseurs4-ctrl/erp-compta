const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function getEcritures(societeId, exercice) {
  const snap = await db.collection('ecritures')
    .where('societeId', '==', societeId)
    .where('exercice', '==', Number(exercice))
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getPlanComptable(societeId) {
  const snap = await db.collection('plan_comptable')
    .where('societeId', '==', societeId)
    .get();
  const map = new Map();
  snap.docs.forEach(d => map.set(d.data().numero, d.data()));
  return map;
}

// GET /api/rapports/:societeId/grand-livre?compte=XXX&exercice=YYYY
router.get('/:societeId/grand-livre', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { compte, exercice } = req.query;

    if (!compte || !exercice) {
      return res.status(400).json({ error: 'compte et exercice sont requis' });
    }

    const ecritures = await getEcritures(societeId, exercice);

    const mouvements = [];
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        if (ligne.compte === String(compte)) {
          mouvements.push({
            date: ec.date,
            journalCode: ec.journalCode,
            numero: ec.numero,
            libelle: ligne.libelle || ec.libelle,
            debit: ligne.debit,
            credit: ligne.credit,
          });
        }
      }
    }

    mouvements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.numero - b.numero));

    let solde = 0;
    const lignes = mouvements.map(m => {
      solde = round2(solde + m.debit - m.credit);
      return { ...m, solde };
    });

    const totalDebit = round2(mouvements.reduce((s, m) => s + m.debit, 0));
    const totalCredit = round2(mouvements.reduce((s, m) => s + m.credit, 0));

    res.json({ compte, totalDebit, totalCredit, soldeFinal: solde, lignes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rapports/:societeId/balance?exercice=YYYY
router.get('/:societeId/balance', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;

    if (!exercice) {
      return res.status(400).json({ error: 'exercice requis' });
    }

    const [ecritures, planComptable] = await Promise.all([
      getEcritures(societeId, exercice),
      getPlanComptable(societeId),
    ]);

    const totaux = new Map(); // numero -> { totalDebit, totalCredit }
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        const t = totaux.get(ligne.compte) || { totalDebit: 0, totalCredit: 0 };
        t.totalDebit = round2(t.totalDebit + ligne.debit);
        t.totalCredit = round2(t.totalCredit + ligne.credit);
        totaux.set(ligne.compte, t);
      }
    }

    const balance = [...totaux.entries()].map(([numero, t]) => {
      const compte = planComptable.get(numero) || { numero, libelle: '(compte inconnu)', classe: 0 };
      const solde = round2(t.totalDebit - t.totalCredit);
      return {
        numero,
        libelle: compte.libelle,
        classe: compte.classe,
        totalDebit: t.totalDebit,
        totalCredit: t.totalCredit,
        soldeDebiteur: solde > 0 ? solde : 0,
        soldeCrediteur: solde < 0 ? -solde : 0,
      };
    }).sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    const totals = balance.reduce((acc, l) => ({
      totalDebit: round2(acc.totalDebit + l.totalDebit),
      totalCredit: round2(acc.totalCredit + l.totalCredit),
      soldeDebiteur: round2(acc.soldeDebiteur + l.soldeDebiteur),
      soldeCrediteur: round2(acc.soldeCrediteur + l.soldeCrediteur),
    }), { totalDebit: 0, totalCredit: 0, soldeDebiteur: 0, soldeCrediteur: 0 });

    res.json({ lignes: balance, totaux: totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rapports/:societeId/bilan?exercice=YYYY — Actif / Passif (classes 1 à 5)
router.get('/:societeId/bilan', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const [ecritures, planComptable] = await Promise.all([
      getEcritures(societeId, exercice),
      getPlanComptable(societeId),
    ]);

    const soldes = new Map();
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        const s = soldes.get(ligne.compte) || 0;
        soldes.set(ligne.compte, round2(s + ligne.debit - ligne.credit));
      }
    }

    const actif = [];
    const passif = [];

    for (const [numero, solde] of soldes.entries()) {
      if (solde === 0) continue;
      const compte = planComptable.get(numero) || { numero, libelle: '(compte inconnu)', classe: 0 };
      const classe = compte.classe;
      if (classe < 1 || classe > 5) continue; // classes 6/7/8 => compte de résultat

      const entry = { numero, libelle: compte.libelle, montant: Math.abs(solde) };
      if (classe === 1) {
        // Ressources (capitaux propres, dettes financières) : normalement créditrices => passif
        if (solde < 0) passif.push(entry); else actif.push(entry); // compte débiteur exceptionnel (ex: report déficitaire)
      } else {
        // Classes 2 à 5 (actif immobilisé, stocks, tiers, trésorerie)
        if (solde >= 0) actif.push(entry); else passif.push(entry);
      }
    }

    const totalActif = round2(actif.reduce((s, l) => s + l.montant, 0));
    const totalPassif = round2(passif.reduce((s, l) => s + l.montant, 0));

    res.json({
      actif: actif.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })),
      passif: passif.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })),
      totalActif,
      totalPassif,
      equilibre: totalActif === totalPassif,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rapports/:societeId/resultat?exercice=YYYY — Charges / Produits (classes 6 et 7)
router.get('/:societeId/resultat', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const [ecritures, planComptable] = await Promise.all([
      getEcritures(societeId, exercice),
      getPlanComptable(societeId),
    ]);

    const soldes = new Map();
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        const s = soldes.get(ligne.compte) || 0;
        soldes.set(ligne.compte, round2(s + ligne.debit - ligne.credit));
      }
    }

    const charges = [];
    const produits = [];

    for (const [numero, solde] of soldes.entries()) {
      if (solde === 0) continue;
      const compte = planComptable.get(numero) || { numero, libelle: '(compte inconnu)', classe: 0 };
      const classe = compte.classe;

      if (classe === 6) {
        charges.push({ numero, libelle: compte.libelle, montant: solde }); // normalement débiteur (positif)
      } else if (classe === 7) {
        produits.push({ numero, libelle: compte.libelle, montant: -solde }); // normalement créditeur (négatif -> positif)
      }
    }

    const totalCharges = round2(charges.reduce((s, l) => s + l.montant, 0));
    const totalProduits = round2(produits.reduce((s, l) => s + l.montant, 0));
    const resultatNet = round2(totalProduits - totalCharges);

    res.json({
      charges: charges.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })),
      produits: produits.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })),
      totalCharges,
      totalProduits,
      resultatNet,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rapports/:societeId/balance-auxiliaire?type=client|fournisseur&exercice=YYYY
router.get('/:societeId/balance-auxiliaire', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { type, exercice } = req.query;

    if (!type || !['client', 'fournisseur'].includes(type)) {
      return res.status(400).json({ error: 'type doit être "client" ou "fournisseur"' });
    }
    if (!exercice) {
      return res.status(400).json({ error: 'exercice requis' });
    }

    const [ecritures, tiersSnap] = await Promise.all([
      getEcritures(societeId, exercice),
      db.collection('tiers').where('societeId', '==', societeId).where('type', '==', type).get(),
    ]);

    const tiersList = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totaux = new Map(); // compteNumero -> { totalDebit, totalCredit }
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        const t = totaux.get(ligne.compte) || { totalDebit: 0, totalCredit: 0 };
        t.totalDebit = round2(t.totalDebit + ligne.debit);
        t.totalCredit = round2(t.totalCredit + ligne.credit);
        totaux.set(ligne.compte, t);
      }
    }

    const lignes = tiersList.map(t => {
      const total = totaux.get(t.compteNumero) || { totalDebit: 0, totalCredit: 0 };
      return {
        id: t.id,
        nom: t.nom,
        compteNumero: t.compteNumero,
        totalDebit: total.totalDebit,
        totalCredit: total.totalCredit,
        solde: round2(total.totalDebit - total.totalCredit),
      };
    }).sort((a, b) => a.nom.localeCompare(b.nom));

    const totauxGlobaux = lignes.reduce((acc, l) => ({
      totalDebit: round2(acc.totalDebit + l.totalDebit),
      totalCredit: round2(acc.totalCredit + l.totalCredit),
      solde: round2(acc.solde + l.solde),
    }), { totalDebit: 0, totalCredit: 0, solde: 0 });

    res.json({ lignes, totaux: totauxGlobaux });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
