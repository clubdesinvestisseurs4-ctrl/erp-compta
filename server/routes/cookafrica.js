// Import des ventes et dépenses de l'app Cook Africa en écritures comptables (voir
// utils/pontCookAfrica.js). Deux temps, comme le demanderait un comptable : un APERÇU des
// écritures proposées, puis l'IMPORT de ce même aperçu.
const crypto = require('crypto');
const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const { getJournal } = require('../utils/cookafricaClient');
const { createEcriture, extournerEcriture, checkComptesExist, isExerciceClos } = require('../utils/ecritures');
const { fusionnerMapping, planifierImport, comptesDuMapping, MAPPING_DEFAUT, periodesSync } = require('../utils/pontCookAfrica');

const router = express.Router();
const IMPORTS = 'imports_cookafrica';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = ['admin', 'comptable'];
const SYNC_DEPUIS_DEFAUT = '2026-11-01';

function cleSyncValide(cle) {
  const attendue = process.env.ERP_SYNC_KEY;
  const a = Buffer.from(String(cle || ''));
  const b = Buffer.from(String(attendue || ''));
  return Boolean(attendue) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

// Applique l'import d'une période (aperçu recalculé ici, jamais repris du client). Partagé par
// l'import manuel et la synchronisation automatique de la nuit.
async function executerImport(societeId, debut, fin, createdBy) {
  const { plan, comptesManquants, exerciceClos } = await preparer(societeId, debut, fin);
  if (exerciceClos) throw Object.assign(new Error(`L'exercice ${debut.slice(0, 4)} est clôturé`), { status: 409 });
  if (comptesManquants.length) {
    throw Object.assign(new Error(`Comptes absents du plan comptable : ${comptesManquants.join(', ')}`), { status: 400 });
  }
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
  return { debut, fin, ...faits, resume: plan.resume };
}

// POST /api/cookafrica/:societeId/importer { debut, fin } — import manuel d'une période.
router.post('/:societeId/importer', ...garde, requireRole(...ROLES), async (req, res) => {
  const periode = lirePeriode(req.body || {});
  if (periode.error) return res.status(400).json({ error: periode.error });
  try {
    const r = await executerImport(req.params.societeId, periode.debut, periode.fin, req.user.username);
    res.status(r.erreurs.length ? 207 : 200).json(r);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Import Cook Africa:', err);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/cookafrica/sync — synchronisation automatique, appelée chaque nuit par GitHub Actions
// (.github/workflows/sync-cookafrica.yml) avec la clé de service X-Sync-Key (ERP_SYNC_KEY).
// Importe tout ce qui a été saisi ou corrigé dans Cook Africa sur les 35 derniers jours jusqu'à
// HIER (la journée en cours est encore ouverte), sans remonter avant `syncCookAfrica.depuis`
// (2026-11-01 par défaut : l'historique d'avant reste à importer à la main, après contrôle).
router.post('/sync', async (req, res) => {
  if (!cleSyncValide(req.headers['x-sync-key'])) return res.status(401).json({ error: 'Clé de synchronisation invalide' });
  const societeId = 'cookafrica';
  const societeRef = db.collection('societes').doc(societeId);
  try {
    const config = ((await societeRef.get()).data() || {}).syncCookAfrica || {};
    const periodes = periodesSync(new Date(), config.depuis || SYNC_DEPUIS_DEFAUT);
    const resultats = [];
    for (const p of periodes) resultats.push(await executerImport(societeId, p.debut, p.fin, 'synchro-auto'));
    const bilan = {
      at: new Date().toISOString(),
      periodes,
      crees: resultats.reduce((s, r) => s + r.crees, 0),
      extournes: resultats.reduce((s, r) => s + r.extournes, 0),
      erreurs: resultats.flatMap(r => r.erreurs).slice(0, 20),
    };
    await societeRef.set({ syncCookAfrica: { ...config, dernier: bilan } }, { merge: true });
    res.status(bilan.erreurs.length ? 207 : 200).json(bilan);
  } catch (err) {
    console.error('Synchro Cook Africa:', err);
    await societeRef.set({ syncCookAfrica: { dernier: { at: new Date().toISOString(), echec: err.message } } }, { merge: true }).catch(() => {});
    res.status(err.status || 502).json({ error: err.message });
  }
});

// GET /api/cookafrica/:societeId/sync — état de la dernière synchronisation (affiché à l'écran).
router.get('/:societeId/sync', ...garde, async (req, res) => {
  const doc = await db.collection('societes').doc(req.params.societeId).get();
  const config = (doc.exists && doc.data().syncCookAfrica) || {};
  res.json({ depuis: config.depuis || SYNC_DEPUIS_DEFAUT, dernier: config.dernier || null });
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
