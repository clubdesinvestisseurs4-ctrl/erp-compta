const test = require('node:test');
const assert = require('node:assert');
const { soldesDepuisEcritures, calculerBilan, calculerResultat, calculerESG } = require('../utils/etats');

const plan = new Map([
  ['101', { classe: 1, libelle: 'Capital social' }],
  ['162', { classe: 1, libelle: 'Emprunts bancaires' }],
  ['2441', { classe: 2, libelle: 'Matériel' }],
  ['2844', { classe: 2, libelle: 'Amortissements du matériel' }],
  ['401', { classe: 4, libelle: 'Fournisseurs' }],
  ['411', { classe: 4, libelle: 'Clients' }],
  ['571', { classe: 5, libelle: 'Caisse' }],
  ['6011', { classe: 6, libelle: 'Denrées' }],
  ['661', { classe: 6, libelle: 'Salaires' }],
  ['681', { classe: 6, libelle: 'Dotations aux amortissements' }],
  ['7062', { classe: 7, libelle: 'Restauration' }],
  ['812', { classe: 8, libelle: 'Valeur comptable des cessions' }],
  ['822', { classe: 8, libelle: 'Produits des cessions' }],
]);

const e = (lignes) => ({ lignes: lignes.map(([compte, debit, credit]) => ({ compte, debit, credit })) });

// Exercice en cours (non clôturé) d'un petit restaurant.
const ecritures = [
  e([['571', 1_000_000, 0], ['101', 0, 1_000_000]]),           // apport en capital
  e([['2441', 600_000, 0], ['571', 0, 600_000]]),              // achat matériel
  e([['571', 500_000, 0], ['162', 0, 500_000]]),               // emprunt
  e([['571', 900_000, 0], ['7062', 0, 900_000]]),              // ventes
  e([['6011', 300_000, 0], ['401', 0, 300_000]]),              // achats à crédit
  e([['661', 200_000, 0], ['571', 0, 200_000]]),               // salaires
  e([['681', 120_000, 0], ['2844', 0, 120_000]]),              // dotation aux amortissements
  e([['411', 50_000, 0], ['7062', 0, 50_000]]),                // vente à crédit
  e([['571', 80_000, 0], ['822', 0, 80_000]]),                 // cession d'un petit équipement (HAO)
  e([['812', 30_000, 0], ['2441', 0, 30_000]]),                // sortie de sa valeur comptable (HAO)
];
const soldes = soldesDepuisEcritures(ecritures);

test('compte de résultat : classe 8 (HAO) incluse', () => {
  const r = calculerResultat(soldes, plan);
  assert.strictEqual(r.totalProduits, 900_000 + 50_000 + 80_000);
  assert.strictEqual(r.totalCharges, 300_000 + 200_000 + 120_000 + 30_000);
  assert.strictEqual(r.resultatNet, 380_000);
  assert.ok(r.charges.find(l => l.numero === '812').hao);
});

test('bilan équilibré en cours d\'exercice grâce au résultat non encore affecté', () => {
  const b = calculerBilan(soldes, plan);
  assert.strictEqual(b.equilibre, true, `écart ${b.ecart}`);
  assert.strictEqual(b.resultatExercice, 380_000);
  const cp = b.passif.find(r => r.code === 'CP');
  assert.ok(cp.lignes.some(l => l.numero === '13' && l.montant === 380_000));
});

test('bilan : amortissements déduits de l\'actif (brut / amort. / net), pas au passif', () => {
  const b = calculerBilan(soldes, plan);
  const ai = b.actif.find(r => r.code === 'AI');
  assert.deepStrictEqual([ai.brut, ai.amortissements, ai.net], [570_000, 120_000, 450_000]);
  assert.ok(!b.passif.some(r => r.lignes.some(l => l.numero === '2844')));
  assert.strictEqual(b.passif.find(r => r.code === 'DF').total, 500_000);       // emprunt
  assert.strictEqual(b.passif.find(r => r.code === 'PC').total, 300_000);       // fournisseur
});

test('perte : résultat négatif dans les capitaux propres, bilan toujours équilibré', () => {
  const s = soldesDepuisEcritures([
    e([['571', 100_000, 0], ['101', 0, 100_000]]),
    e([['661', 150_000, 0], ['571', 0, 150_000]]),
  ]);
  const b = calculerBilan(s, plan);
  assert.strictEqual(b.resultatExercice, -150_000);
  assert.strictEqual(b.equilibre, true);
  assert.strictEqual(b.passif.find(r => r.code === 'TP').total, 50_000);  // caisse créditrice = découvert
});

test('soldes de gestion : même résultat net que le compte de résultat, même pour un compte hors liste', () => {
  const avecCompteImprevu = soldesDepuisEcritures([...ecritures, e([['6588', 10_000, 0], ['571', 0, 10_000]])]);
  const esg = calculerESG(avecCompteImprevu, plan);
  assert.strictEqual(esg.resultatNet, calculerResultat(avecCompteImprevu, plan).resultatNet);
  assert.strictEqual(esg.resultatHAO, 50_000);
  assert.strictEqual(esg.autresChargesExploitation, 10_000);
});

test('exercice clôturé (comptes 6/7/8 soldés) : pas de ligne de résultat en double', () => {
  const s = soldesDepuisEcritures([e([['571', 100_000, 0], ['101', 0, 100_000]])]);
  const b = calculerBilan(s, plan);
  assert.strictEqual(b.resultatInclus, false);
  assert.strictEqual(b.equilibre, true);
});
