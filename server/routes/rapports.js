const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const etats = require('../utils/etats');

const router = express.Router({ mergeParams: true });

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// dateDebut/dateFin (YYYY-MM-DD, optionnels) restreignent aux écritures dont la date tombe dans
// cette plage, en plus du filtre par exercice — permet de consulter un mois ou une période
// personnalisée plutôt que l'exercice entier.
async function getEcritures(societeId, exercice, dateDebut, dateFin) {
  const snap = await db.collection('ecritures')
    .where('societeId', '==', societeId)
    .where('exercice', '==', Number(exercice))
    .get();
  let ecritures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (dateDebut) ecritures = ecritures.filter(ec => ec.date >= dateDebut);
  if (dateFin) ecritures = ecritures.filter(ec => ec.date <= dateFin);
  return ecritures;
}

async function getPlanComptable(societeId) {
  const snap = await db.collection('plan_comptable')
    .where('societeId', '==', societeId)
    .get();
  const map = new Map();
  snap.docs.forEach(d => map.set(d.data().numero, d.data()));
  return map;
}

async function getSoldes(societeId, exercice, dateDebut, dateFin) {
  return etats.soldesDepuisEcritures(await getEcritures(societeId, exercice, dateDebut, dateFin));
}

// Somme brute (débit − crédit) d'une liste de comptes — utilisée par le flux de trésorerie.
function sommeCharges(soldes, comptes) {
  return round2(comptes.reduce((s, c) => s + (soldes.get(c) || 0), 0));
}

// État des Soldes de Gestion : calcul dans utils/etats.js (tous les comptes 6/7/8 classés,
// résultat identique au compte de résultat).
async function calculerESG(societeId, exercice, dateDebut, dateFin) {
  const [soldes, plan] = await Promise.all([
    getSoldes(societeId, exercice, dateDebut, dateFin),
    getPlanComptable(societeId),
  ]);
  return { exercice: Number(exercice), ...etats.calculerESG(soldes, plan) };
}

// Répartit les comptes d'une plage de classes en actif (solde débiteur) / passif (solde créditeur),
// avec la même convention de signe que /bilan.
function repartirActifPassif(soldes, planComptable, classeMin, classeMax) {
  let actif = 0;
  let passif = 0;
  for (const [numero, solde] of soldes.entries()) {
    if (solde === 0) continue;
    const compte = planComptable.get(numero);
    const classe = compte ? compte.classe : 0;
    if (classe < classeMin || classe > classeMax) continue;
    if (solde >= 0) actif = round2(actif + solde); else passif = round2(passif - solde);
  }
  return { actif, passif };
}

function sommeClasseEtPrefixe(soldes, planComptable, classe, prefixeExclu) {
  let total = 0;
  for (const [numero, solde] of soldes.entries()) {
    const compte = planComptable.get(numero);
    if (!compte || compte.classe !== classe) continue;
    if (prefixeExclu && numero.startsWith(prefixeExclu)) continue;
    total = round2(total + solde);
  }
  return total;
}

// GET /api/rapports/:societeId/grand-livre?compte=XXX&exercice=YYYY&dateDebut=&dateFin=
router.get('/:societeId/grand-livre', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { compte, exercice, dateDebut, dateFin } = req.query;

    if (!compte || !exercice) {
      return res.status(400).json({ error: 'compte et exercice sont requis' });
    }

    // Toutes les écritures de l'exercice, pour calculer le solde initial avant dateDebut.
    const ecritures = await getEcritures(societeId, exercice);

    let soldeInitial = 0;
    const mouvements = [];
    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        if (ligne.compte !== String(compte)) continue;
        if (dateDebut && ec.date < dateDebut) {
          soldeInitial = round2(soldeInitial + ligne.debit - ligne.credit);
          continue;
        }
        if (dateFin && ec.date > dateFin) continue;
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

    mouvements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.numero - b.numero));

    let solde = soldeInitial;
    const lignes = mouvements.map(m => {
      solde = round2(solde + m.debit - m.credit);
      return { ...m, solde };
    });

    const totalDebit = round2(mouvements.reduce((s, m) => s + m.debit, 0));
    const totalCredit = round2(mouvements.reduce((s, m) => s + m.credit, 0));

    res.json({ compte, soldeInitial, totalDebit, totalCredit, soldeFinal: solde, lignes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/balance?exercice=YYYY&dateDebut=&dateFin=
router.get('/:societeId/balance', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice, dateDebut, dateFin } = req.query;

    if (!exercice) {
      return res.status(400).json({ error: 'exercice requis' });
    }

    const [ecritures, planComptable] = await Promise.all([
      getEcritures(societeId, exercice, dateDebut, dateFin),
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
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/bilan?exercice=YYYY&dateDebut=&dateFin=
// Présentation SYSCOHADA par rubriques (brut / amortissements / net à l'actif), résultat de
// l'exercice en cours inclus au passif tant que l'exercice n'est pas clôturé.
router.get('/:societeId/bilan', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice, dateDebut, dateFin } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });
    const [soldes, plan] = await Promise.all([
      getSoldes(societeId, exercice, dateDebut, dateFin),
      getPlanComptable(societeId),
    ]);
    res.json(etats.calculerBilan(soldes, plan));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/resultat?exercice=YYYY&dateDebut=&dateFin=
// Charges / Produits : classes 6 et 7, plus la classe 8 (Hors Activités Ordinaires, marquée hao).
router.get('/:societeId/resultat', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice, dateDebut, dateFin } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });
    const [soldes, plan] = await Promise.all([
      getSoldes(societeId, exercice, dateDebut, dateFin),
      getPlanComptable(societeId),
    ]);
    res.json(etats.calculerResultat(soldes, plan));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/balance-auxiliaire?type=client|fournisseur&exercice=YYYY&dateDebut=&dateFin=
router.get('/:societeId/balance-auxiliaire', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { type, exercice, dateDebut, dateFin } = req.query;

    if (!type || !['client', 'fournisseur'].includes(type)) {
      return res.status(400).json({ error: 'type doit être "client" ou "fournisseur"' });
    }
    if (!exercice) {
      return res.status(400).json({ error: 'exercice requis' });
    }

    const [ecritures, tiersSnap] = await Promise.all([
      getEcritures(societeId, exercice, dateDebut, dateFin),
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
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/declaration-tva?dateDebut=YYYY-MM-DD&dateFin=YYYY-MM-DD
// TVA collectée (compte 4431) - TVA déductible (comptes 4452/4454/4456) sur une période.
router.get('/:societeId/declaration-tva', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { dateDebut, dateFin } = req.query;
    if (!dateDebut || !dateFin) {
      return res.status(400).json({ error: 'dateDebut et dateFin sont requis' });
    }

    const snap = await db.collection('ecritures').where('societeId', '==', societeId).get();

    const COMPTES_COLLECTEE = ['443', '4431'];
    const COMPTES_DEDUCTIBLE = ['4452', '4454', '4456'];

    let tvaCollectee = 0;
    let tvaDeductible = 0;

    for (const doc of snap.docs) {
      const ec = doc.data();
      if (ec.date < dateDebut || ec.date > dateFin) continue;
      for (const ligne of ec.lignes) {
        if (COMPTES_COLLECTEE.includes(ligne.compte)) {
          tvaCollectee = round2(tvaCollectee + ligne.credit - ligne.debit);
        } else if (COMPTES_DEDUCTIBLE.includes(ligne.compte)) {
          tvaDeductible = round2(tvaDeductible + ligne.debit - ligne.credit);
        }
      }
    }

    const tvaNette = round2(tvaCollectee - tvaDeductible);

    res.json({
      dateDebut,
      dateFin,
      tvaCollectee,
      tvaDeductible,
      tvaNette,
      sens: tvaNette >= 0 ? 'a_payer' : 'credit_a_reporter',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/esg?exercice=YYYY&dateDebut=&dateFin= — État des Soldes de Gestion
router.get('/:societeId/esg', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice, dateDebut, dateFin } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const esg = await calculerESG(societeId, exercice, dateDebut, dateFin);
    res.json(esg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// GET /api/rapports/:societeId/flux-tresorerie?exercice=YYYY
// Tableau des flux de trésorerie simplifié (méthode indirecte, inspiré du TAFIRE SYSCOHADA) :
// compare l'exercice à l'exercice précédent pour reconstituer les flux d'exploitation,
// d'investissement et de financement. À considérer comme indicatif, pas comme le TAFIRE normalisé
// complet (qui détaille des sous-catégories que le plan comptable réduit de cette appli ne distingue pas).
router.get('/:societeId/flux-tresorerie', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const exerciceN = Number(exercice);
    const exerciceN1 = exerciceN - 1;

    const [esgN, soldesN, soldesN1, planComptable] = await Promise.all([
      calculerESG(societeId, exerciceN),
      getSoldes(societeId, exerciceN),
      getSoldes(societeId, exerciceN1),
      getPlanComptable(societeId),
    ]);

    const cafg = round2(esgN.resultatNet + esgN.dotationsExploitation - esgN.reprisesExploitation);

    const bfrN = repartirActifPassif(soldesN, planComptable, 3, 4);
    const bfrN1 = repartirActifPassif(soldesN1, planComptable, 3, 4);
    const variationBfr = round2((bfrN.actif - bfrN1.actif) - (bfrN.passif - bfrN1.passif));

    const fluxExploitation = round2(cafg - variationBfr);

    const immoBrutesN = sommeClasseEtPrefixe(soldesN, planComptable, 2, '28');
    const immoBrutesN1 = sommeClasseEtPrefixe(soldesN1, planComptable, 2, '28');
    const fluxInvestissement = round2(-(immoBrutesN - immoBrutesN1));

    const capitauxHorsResultat = ['101', '106', '110', '119', '131'];
    const emprunts = ['161', '166', '168'];
    const financementComptes = [...capitauxHorsResultat, ...emprunts];
    // sommeCharges() sert ici juste de somme brute (débit-crédit) des comptes listés, pas une
    // notion de "charge" : ces comptes sont normalement créditeurs, donc une augmentation de
    // capital/emprunt fait baisser ce solde (plus négatif) — le flux de financement en est l'opposé.
    const financementN = sommeCharges(soldesN, financementComptes);
    const financementN1 = sommeCharges(soldesN1, financementComptes);
    const fluxFinancement = round2(-(financementN - financementN1));

    const variationTresorerieCalculee = round2(fluxExploitation + fluxInvestissement + fluxFinancement);

    const tresorerieN = sommeClasseEtPrefixe(soldesN, planComptable, 5, null);
    const tresorerieN1 = sommeClasseEtPrefixe(soldesN1, planComptable, 5, null);
    const variationTresorerieBilan = round2(tresorerieN - tresorerieN1);

    const ecartControle = round2(variationTresorerieCalculee - variationTresorerieBilan);

    res.json({
      exercice: exerciceN,
      exercicePrecedent: exerciceN1,
      resultatNet: esgN.resultatNet,
      dotationsExploitation: esgN.dotationsExploitation,
      reprisesExploitation: esgN.reprisesExploitation,
      cafg,
      variationBfr,
      fluxExploitation,
      fluxInvestissement,
      fluxFinancement,
      variationTresorerieCalculee,
      variationTresorerieBilan,
      ecartControle,
    });
  } catch (err) {
    console.error('Flux tresorerie error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
