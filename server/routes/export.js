const express = require('express');
const { db } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { requireSocieteAccess } = require('../middleware/societe');

const router = express.Router({ mergeParams: true });

function formatDateFec(date) {
  return String(date).replace(/-/g, '');
}

function champFec(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes('\t') || s.includes('\n') ? s.replace(/[\t\n]/g, ' ') : s;
}

// GET /api/export/:societeId/fec?exercice=YYYY — Fichier des Écritures Comptables (format normalisé,
// colonnes inspirées du FEC français, exploitable par tout expert-comptable ou tableur).
router.get('/:societeId/fec', authenticateToken, requireSocieteAccess, async (req, res) => {
  try {
    const { societeId } = req.params;
    const { exercice } = req.query;
    if (!exercice) return res.status(400).json({ error: 'exercice requis' });

    const [ecrituresSnap, journauxSnap, planComptableSnap] = await Promise.all([
      db.collection('ecritures').where('societeId', '==', societeId).where('exercice', '==', Number(exercice)).get(),
      db.collection('journaux').where('societeId', '==', societeId).get(),
      db.collection('plan_comptable').where('societeId', '==', societeId).get(),
    ]);

    const journalLib = new Map(journauxSnap.docs.map(d => [d.data().code, d.data().libelle]));
    const compteLib = new Map(planComptableSnap.docs.map(d => [d.data().numero, d.data().libelle]));

    const colonnes = [
      'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
      'CompteNum', 'CompteLib', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'ValidDate',
    ];
    const lignesFichier = [colonnes.join('\t')];

    const ecritures = ecrituresSnap.docs.map(d => d.data())
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.numero - b.numero));

    for (const ec of ecritures) {
      for (const ligne of ec.lignes) {
        lignesFichier.push([
          ec.journalCode,
          champFec(journalLib.get(ec.journalCode) || ''),
          `${ec.journalCode}-${ec.numero}`,
          formatDateFec(ec.date),
          ligne.compte,
          champFec(compteLib.get(ligne.compte) || ''),
          champFec(ligne.libelle || ec.libelle),
          (ligne.debit || 0).toFixed(2),
          (ligne.credit || 0).toFixed(2),
          ligne.lettre || '',
          formatDateFec((ec.createdAt || ec.date).slice(0, 10)),
        ].join('\t'));
      }
    }

    const BOM = String.fromCharCode(0xFEFF);
    const contenu = BOM + lignesFichier.join('\r\n');
    const nomFichier = `FEC_${societeId}_${exercice}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
    res.send(contenu);
  } catch (err) {
    console.error('Export FEC error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
