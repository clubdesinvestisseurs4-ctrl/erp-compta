// Import des ventes et dépenses de l'app Cook Africa en écritures comptables (voir
// utils/pontCookAfrica.js). Deux temps, comme le demanderait un comptable : un APERÇU des
// écritures proposées, puis l'IMPORT de ce même aperçu.
const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { getJournal } = require('../utils/cookafricaClient');
const { createEcriture, extournerEcriture, checkComptesExist, isExerciceClos } = require('../utils/ecritures');
const { fusionnerMapping, planifierImport, comptesDuMapping, MAPPING_DEFAUT } = require('../utils/pontCookAfrica');

const router = express.Router();
const IMPORTS = 'imports_cookafrica';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = ['admin', 'comptable'];

// Pont réservé à la société Cook Africa (l'hôtel Ohinéné n'a pas d'app de caisse reliée).
function requireCookAfrica(req, res, next) {
  if (req.params.societeId !== 'cookafrica') {
    return res.status(400).json({ error: 'Import disponible uniquement pour la société Cook Africa' });
  }
  next();
}
const garde = [authenticateToken, requireSocieteAccess, requireCookAfrica];

async function chargerMapping(societeId) {
  const doc = await db.collection('societes').doc(societeId).get();
  return fusionnerMapping((doc.exists && doc.data().mappingCookAfrica) || {});
}

async function chargerDejaImportes(societeId, operationsCles) {
  if (!operationsCles.length) return new Map();
  const refs = operationsCles.map(cle => db.collection(IMPORTS).doc(`${societeId}_${cle}`));
  const docs = await db.getAll(...refs);
  return new Map(docs.filter(d => d.exists).map(d => [d.data().cle, d.data()]));
}

function lirePeriode(src) {
  const { debut, fin } = src;
  if (!DATE_RE.test(debut || '') || !DATE_RE.test(fin || '') || debut > fin) {
    return { error: 'debut et fin (AAAA-MM-JJ) sont requis' };
  }
  if (debut.slice(0, 4) !== fin.slice(0, 4)) return { error: 'La période doit tenir dans un seul exercice' };
  return { debut, fin };
}

async function preparer(societeId, debut, fin) {
  const [donnees, mapping] = await Promise.all([getJournal(debut, fin), chargerMapping(societeId)]);
  const cles = [
    ...(donnees.ventes || []).map(j => `ventes:${j.date}`),
    ...(donnees.depenses || []).map(d => `depense:${d.id}`),
  ];
  const dejaImportes = await chargerDejaImportes(societeId, cles);
  const plan = planifierImport(donnees, dejaImportes, mapping);
  const comptesManquants = await checkComptesExist(societeId, comptesDuMapping(mapping).map(compte => ({ compte })));
  return { mapping, plan, comptesManquants, exerciceClos: await isExerciceClos(societeId, Number(debut.slice(0, 4))) };
}

// GET /api/cookafrica/:societeId/apercu?debut=&fin=
router.get('/:societeId/apercu', ...garde, async (req, res) => {
  const periode = lirePeriode(req.query);
  if (periode.error) return res.status(400).json({ error: periode.error });
  try {
    const { mapping, plan, comptesManquants, exerciceClos } = await preparer(req.params.societeId, periode.debut, periode.fin);
    res.json({ ...periode, mapping, comptesManquants, exerciceClos, ...plan });
  } catch (err) {
    console.error('Aperçu Cook Africa:', err);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/cookafrica/:societeId/importer { debut, fin }
// Recalcule l'aperçu (jamais de confiance dans un aperçu renvoyé par le client) puis l'applique.
router.post('/:societeId/importer', ...garde, requireRole(...ROLES), async (req, res) => {
  const periode = lirePeriode(req.body || {});
  if (periode.error) return res.status(400).json({ error: periode.error });
  const { societeId } = req.params;
  try {
    const { plan, comptesManquants, exerciceClos } = await preparer(societeId, periode.debut, periode.fin);
    if (exerciceClos) return res.status(409).json({ error: `L'exercice ${periode.debut.slice(0, 4)} est clôturé` });
    if (comptesManquants.length) {
      return res.status(400).json({ error: `Comptes absents du plan comptable : ${comptesManquants.join(', ')}` });
    }

    const createdBy = req.user.username;
    const faits = { crees: 0, extournes: 0, erreurs: [] };
    for (const op of plan.operations) {
      if (op.statut === 'a-jour') continue;
      const ref = db.collection(IMPORTS).doc(`${societeId}_${op.cle}`);
      try {
        if (op.statut === 'modifie' || op.statut === 'supprime') {
          const prec = (await ref.get()).data() || {};
          try {
            await extournerEcriture({
              societeId, id: op.ecritureId, date: prec.date, createdBy,
              motif: op.statut === 'supprime' ? 'supprimée dans Cook Africa' : 'modifiée dans Cook Africa',
            });
          } catch (err) {
            if (err.code !== 409) throw err; // déjà extournée à la main : on continue
          }
          faits.extournes += 1;
          if (op.statut === 'supprime') {
            await ref.set({ annule: true, annuleLe: new Date().toISOString(), annulePar: createdBy }, { merge: true });
            continue;
          }
        }
        const ecriture = await createEcriture({
          societeId, ...op.ecriture,
          exercice: Number(op.ecriture.date.slice(0, 4)),
          createdBy,
          source: `cookafrica:${op.cle}`,
        });
        await ref.set({
          societeId, cle: op.cle, signature: op.signature, ecritureId: ecriture.id,
          date: op.ecriture.date, montant: op.montant, annule: false,
          importeLe: new Date().toISOString(), importePar: createdBy,
        });
        faits.crees += 1;
      } catch (err) {
        faits.erreurs.push({ cle: op.cle, error: err.message });
      }
    }
    res.status(faits.erreurs.length ? 207 : 200).json({ ...periode, ...faits, resume: plan.resume });
  } catch (err) {
    console.error('Import Cook Africa:', err);
    res.status(502).json({ error: err.message });
  }
});

// GET / PUT /api/cookafrica/:societeId/mapping — correspondances catégorie → compte, modifiables
// par le comptable sans redéploiement.
router.get('/:societeId/mapping', ...garde, async (req, res) => {
  res.json({ mapping: await chargerMapping(req.params.societeId), defaut: MAPPING_DEFAUT });
});

router.put('/:societeId/mapping', ...garde, requireRole(...ROLES), async (req, res) => {
  const { societeId } = req.params;
  const mapping = fusionnerMapping(req.body && req.body.mapping);
  const comptes = comptesDuMapping(mapping);
  if (comptes.some(c => !/^\d{2,8}$/.test(String(c)))) return res.status(400).json({ error: 'Numéro de compte invalide' });
  const manquants = await checkComptesExist(societeId, comptes.map(compte => ({ compte })));
  if (manquants.length) return res.status(400).json({ error: `Comptes absents du plan comptable : ${manquants.join(', ')}` });
  for (const j of [mapping.journalVentes, mapping.journalCaisse, mapping.journalBanque]) {
    const doc = await db.collection('journaux').doc(`${societeId}_${j}`).get();
    if (!doc.exists) return res.status(400).json({ error: `Journal inconnu : ${j}` });
  }
  await db.collection('societes').doc(societeId).update({ mappingCookAfrica: mapping });
  res.json({ mapping });
});

module.exports = router;
