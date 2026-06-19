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

async function getSoldes(societeId, exercice) {
  const ecritures = await getEcritures(societeId, exercice);
  const soldes = new Map();
  for (const ec of ecritures) {
    for (const ligne of ec.lignes) {
      const s = soldes.get(ligne.compte) || 0;
      soldes.set(ligne.compte, round2(s + ligne.debit - ligne.credit));
    }
  }
  return soldes;
}

// Groupes de comptes utilisés pour l'État des Soldes de Gestion (SYSCOHADA), adaptés au plan
// comptable réduit de cette application (pas de compte de variation de stock ni de production
// stockée/immobilisée : ces lignes restent à 0 par construction).
const ESG_GROUPES = {
  ventesMarchandises: ['701'],
  achatsMarchandises: ['601', '608', '6011', '6013'],
  productionVendue: ['702', '704', '706', '7061', '7062', '707', '709'],
  achatsEtServicesExterieurs: ['602', '604', '605', '611', '612', '614', '616', '618', '622', '624', '625', '626', '627', '628', '6281', '6285', '632', '633', '637', '638'],
  chargesPersonnel: ['661', '663', '664', '666'],
  impotsEtTaxes: ['641', '645', '646', '647'],
  dotationsExploitation: ['681', '691'],
  reprisesExploitation: ['781', '791'],
  autresProduitsExploitation: ['758'],
  chargesFinancieres: ['631', '671', '676'],
  produitsFinanciers: ['776'],
  chargesHAO: ['811'],
  produitsHAO: ['821'],
  impotResultat: ['695'],
};

function sommeCharges(soldes, comptes) {
  return round2(comptes.reduce((s, c) => s + (soldes.get(c) || 0), 0));
}
function sommeProduits(soldes, comptes) {
  return round2(comptes.reduce((s, c) => s - (soldes.get(c) || 0), 0));
}

async function calculerESG(societeId, exercice) {
  const soldes = await getSoldes(societeId, exercice);
  const G = ESG_GROUPES;

  const ventesMarchandises = sommeProduits(soldes, G.ventesMarchandises);
  const achatsMarchandises = sommeCharges(soldes, G.achatsMarchandises);
  const margeCommerciale = round2(ventesMarchandises - achatsMarchandises);

  const productionExercice = sommeProduits(soldes, G.productionVendue);

  const achatsEtServicesExterieurs = sommeCharges(soldes, G.achatsEtServicesExterieurs);
  const valeurAjoutee = round2(margeCommerciale + productionExercice - achatsEtServicesExterieurs);

  const chargesPersonnel = sommeCharges(soldes, G.chargesPersonnel);
  const impotsEtTaxes = sommeCharges(soldes, G.impotsEtTaxes);
  const excedentBrutExploitation = round2(valeurAjoutee - chargesPersonnel - impotsEtTaxes);

  const reprisesExploitation = sommeProduits(soldes, G.reprisesExploitation);
  const dotationsExploitation = sommeCharges(soldes, G.dotationsExploitation);
  const autresProduitsExploitation = sommeProduits(soldes, G.autresProduitsExploitation);
  const resultatExploitation = round2(excedentBrutExploitation + reprisesExploitation - dotationsExploitation + autresProduitsExploitation);

  const produitsFinanciers = sommeProduits(soldes, G.produitsFinanciers);
  const chargesFinancieres = sommeCharges(soldes, G.chargesFinancieres);
  const resultatFinancier = round2(produitsFinanciers - chargesFinancieres);

  const resultatActivitesOrdinaires = round2(resultatExploitation + resultatFinancier);

  const produitsHAO = sommeProduits(soldes, G.produitsHAO);
  const chargesHAO = sommeCharges(soldes, G.chargesHAO);
  const resultatHAO = round2(produitsHAO - chargesHAO);

  const impotResultat = sommeCharges(soldes, G.impotResultat);
  const resultatNet = round2(resultatActivitesOrdinaires + resultatHAO - impotResultat);

  return {
    exercice: Number(exercice),
    ventesMarchandises, achatsMarchandises, margeCommerciale,
    productionExercice, achatsEtServicesExterieurs, valeurAjoutee,
    chargesPersonnel, impotsEtTaxes, excedentBrutExploitation,
    reprisesExploitation, dotationsExploitation, autresProduitsExploitation, resultatExploitation,
    produitsFinanciers, chargesFinancieres, resultatFinancier,
    resultatActivitesOrdinaires,
    produitsHAO, chargesHAO, resultatHAO,
    impotResultat, resultatNet,
  };
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
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rapports/:societeId/esg?exercice=YYYY — État des Soldes de Gestion (cascade SYSCOHADA)
router.get('/:societeId/esg', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const esg = await calculerESG(societeId, exercice);
    res.json(esg);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
