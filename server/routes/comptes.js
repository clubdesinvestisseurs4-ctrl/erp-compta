const express = require('express');
const multer = require('multer');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');
const planComptableSyscohada = require('../data/planComptableSyscohada');
const { parsePlanComptableExcel } = require('../utils/importPlanComptable');

const router = express.Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 Mo
});

// Encapsule multer pour renvoyer une erreur JSON 400 propre (fichier trop volumineux, etc.)
// plutôt que de laisser planter sur le handler d'erreurs générique 500.
function uploadFichier(req, res, next) {
  upload.single('fichier')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (2 Mo maximum).' });
      }
      return res.status(400).json({ error: err.message || 'Erreur lors du téléchargement du fichier.' });
    }
    next();
  });
}

function docId(societeId, numero) {
  return `${societeId}_${numero}`;
}

// Écrit en base un lot de comptes du plan comptable (création ou mise à jour), par batches de 400.
async function ecrireComptes(societeId, comptes) {
  const batches = [];
  let batch = db.batch();
  let count = 0;

  for (const compte of comptes) {
    const ref = db.collection('plan_comptable').doc(docId(societeId, compte.numero));
    batch.set(ref, { societeId, ...compte });
    count++;
    if (count % 400 === 0) {
      batches.push(batch.commit());
      batch = db.batch();
    }
  }
  batches.push(batch.commit());
  await Promise.all(batches);
}

// GET /api/comptes/:societeId — plan comptable de la société, trié par numéro
router.get('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const snap = await db.collection('plan_comptable')
      .where('societeId', '==', req.params.societeId)
      .get();

    const comptes = snap.docs.map(d => d.data())
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

    res.json(comptes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/comptes/:societeId/seed — copie le référentiel SYSCOHADA pour la société
router.post('/:societeId/seed', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;

    const existing = await db.collection('plan_comptable')
      .where('societeId', '==', societeId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Plan comptable déjà initialisé pour cette société' });
    }

    await ecrireComptes(societeId, planComptableSyscohada);

    res.json({ message: 'Plan comptable SYSCOHADA initialisé', count: planComptableSyscohada.length });
  } catch (err) {
    console.error('Seed comptes error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/comptes/:societeId/import — charge un plan comptable spécifique depuis un fichier Excel (.xlsx)
// Colonnes attendues en première ligne : Numéro, Libellé, Classe (optionnelle, déduite du 1er chiffre du numéro sinon).
// Les comptes du fichier sont créés ou mis à jour (libellé/classe) ; les comptes existants absents du fichier sont conservés.
router.post('/:societeId/import', authenticateToken, requireSocieteAccess, uploadFichier, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier Excel requis (champ "fichier").' });
    }

    let comptes;
    try {
      comptes = await parsePlanComptableExcel(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message, details: err.details });
    }

    await ecrireComptes(req.params.societeId, comptes);

    res.json({ message: 'Plan comptable importé avec succès', count: comptes.length });
  } catch (err) {
    console.error('Import comptes error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/comptes/:societeId — ajoute un compte spécifique à la société
router.post('/:societeId', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { numero, libelle, classe } = req.body;

    if (!numero || !libelle || !classe) {
      return res.status(400).json({ error: 'numero, libelle et classe sont requis' });
    }

    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const existing = await ref.get();
    if (existing.exists) {
      return res.status(409).json({ error: 'Ce compte existe déjà' });
    }

    await ref.set({ societeId, numero: String(numero), libelle, classe: Number(classe) });
    res.status(201).json({ message: 'Compte créé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/comptes/:societeId/:numero — modifie le libellé d'un compte
router.put('/:societeId/:numero', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, numero } = req.params;
    const { libelle } = req.body;

    if (!libelle) {
      return res.status(400).json({ error: 'libelle requis' });
    }

    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    await ref.update({ libelle });
    res.json({ message: 'Compte mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comptes/:societeId/:numero
router.delete('/:societeId/:numero', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId, numero } = req.params;
    const ref = db.collection('plan_comptable').doc(docId(societeId, numero));
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    await ref.delete();
    res.json({ message: 'Compte supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
