const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { round2 } = require('../utils/ecritures');
const { getChiffreAffaires } = require('../utils/cookafricaClient');

const router = express.Router({ mergeParams: true });

// GET /api/audit-flash/:societeId?debut=YYYY-MM-DD&fin=YYYY-MM-DD
//
// Rapport de lecture seule, à la demande : ne crée ni ne modifie aucune écriture.
// Croise trois sources pour une période donnée :
//   - CA réel encaissé (source cookafrica-app, factures payées uniquement)
//   - Versements bancaires déjà saisis dans ERP-Compta (débits sur le compte 512)
//   - Charges déjà enregistrées dans ERP-Compta (comptes de classe 6)
// … pour donner un bénéfice réel (CA − charges) et un écart de trésorerie
// (CA − versements) qui signale un montant non déposé/non justifié à examiner.
//
// Réservé à la société 'cookafrica' : c'est la seule dont le CA est piloté par une
// application externe. Pour Ohinéné, les ventes sont déjà saisies directement en compta.
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { debut, fin } = req.query;

    if (societeId !== 'cookafrica') {
      return res.status(400).json({ error: "L'Audit Flash n'est disponible que pour la société Cook Africa" });
    }
    if (!debut || !fin) {
      return res.status(400).json({ error: 'debut et fin sont requis' });
    }

    const [ca, ecrituresSnap, planComptableSnap] = await Promise.all([
      getChiffreAffaires(debut, fin),
      db.collection('ecritures').where('societeId', '==', societeId).get(),
      db.collection('plan_comptable').where('societeId', '==', societeId).get(),
    ]);

    const planComptable = new Map();
    planComptableSnap.docs.forEach(d => planComptable.set(d.data().numero, d.data()));

    const ecritures = ecrituresSnap.docs
      .map(d => d.data())
      .filter(ec => ec.date >= debut && ec.date <= fin);

    let versements = 0;
    let charges = 0;
    const versementsDetail = [];
    const chargesDetail = [];

    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        if (ligne.compte === '512' && (ligne.debit || 0) > 0) {
          versements = round2(versements + ligne.debit);
          versementsDetail.push({
            date: ec.date,
            journalCode: ec.journalCode,
            numero: ec.numero,
            libelle: ligne.libelle || ec.libelle,
            montant: round2(ligne.debit),
          });
          continue;
        }
        const compte = planComptable.get(ligne.compte);
        if (compte && compte.classe === 6) {
          const montant = round2((ligne.debit || 0) - (ligne.credit || 0));
          charges = round2(charges + montant);
          chargesDetail.push({
            date: ec.date,
            journalCode: ec.journalCode,
            numero: ec.numero,
            compte: ligne.compte,
            compteLibelle: compte.libelle,
            libelle: ligne.libelle || ec.libelle,
            montant,
          });
        }
      }
    }

    versementsDetail.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    chargesDetail.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const beneficeReel = round2(ca.total - charges);
    const ecartTresorerie = round2(ca.total - versements);

    res.json({
      debut, fin,
      chiffreAffaires: ca.total,
      chiffreAffairesParMode: ca.parMode,
      nombreFactures: ca.nombre,
      versements,
      versementsDetail,
      charges,
      chargesDetail,
      beneficeReel,
      ecartTresorerie,
    });
  } catch (err) {
    console.error('Audit Flash error:', err);
    res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
  }
});

module.exports = router;