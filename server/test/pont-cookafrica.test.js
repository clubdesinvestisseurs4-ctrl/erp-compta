const test = require('node:test');
const assert = require('node:assert');
const { planifierImport, fusionnerMapping, MAPPING_DEFAUT } = require('../utils/pontCookAfrica');

const mapping = fusionnerMapping({});
const donnees = {
  ventes: [{ date: '2026-11-05', total: 85_000, nombre: 12, parMode: { especes: 60_000, mobile: 20_000, carte: 5_000 } }],
  depenses: [
    { id: 'd1', date: '2026-11-05', libelle: 'Riz et poisson', categorie: 'marche-vivres', montant: 25_000, modePaiement: 'especes', supprimee: false },
    { id: 'd2', date: '2026-11-05', libelle: 'Bouteille de gaz', categorie: 'gaz', montant: 15_000, modePaiement: 'mobile', supprimee: false },
  ],
};
const equilibree = (ec) => ec.lignes.reduce((s, l) => s + l.debit, 0) === ec.lignes.reduce((s, l) => s + l.credit, 0);

test('ventes du jour : débit trésorerie par mode, crédit 7062, équilibrée', () => {
  const { operations } = planifierImport(donnees, new Map(), mapping);
  const v = operations.find(o => o.cle === 'ventes:2026-11-05');
  assert.strictEqual(v.statut, 'nouveau');
  assert.strictEqual(v.ecriture.journalCode, 'VE');
  assert.ok(equilibree(v.ecriture));
  const debit = (c) => v.ecriture.lignes.find(l => l.compte === c).debit;
  assert.deepStrictEqual([debit('571'), debit('532'), debit('512')], [60_000, 20_000, 5_000]);
  assert.strictEqual(v.ecriture.lignes.find(l => l.compte === '7062').credit, 85_000);
});

test('dépense : compte de charge selon la catégorie, journal selon le mode de paiement', () => {
  const { operations } = planifierImport(donnees, new Map(), mapping);
  const d1 = operations.find(o => o.cle === 'depense:d1').ecriture;
  const d2 = operations.find(o => o.cle === 'depense:d2').ecriture;
  assert.deepStrictEqual(d1.lignes.map(l => [l.compte, l.debit, l.credit]), [['6011', 25_000, 0], ['571', 0, 25_000]]);
  assert.strictEqual(d1.journalCode, 'CA');
  assert.deepStrictEqual(d2.lignes.map(l => l.compte), ['605', '532']);
  assert.strictEqual(d2.journalCode, 'BQ');
});

test('réimport à l\'identique : rien à faire (pas de doublon)', () => {
  const premier = planifierImport(donnees, new Map(), mapping);
  const deja = new Map(premier.operations.map(o => [o.cle, { signature: o.signature, ecritureId: 'x' }]));
  const second = planifierImport(donnees, deja, mapping);
  assert.deepStrictEqual(second.resume, { nouveau: 0, modifie: 0, supprime: 0, 'a-jour': 3 });
});

test('dépense corrigée puis supprimée dans l\'app : modifie puis supprime', () => {
  const premier = planifierImport(donnees, new Map(), mapping);
  const deja = new Map(premier.operations.map(o => [o.cle, { signature: o.signature, ecritureId: `e-${o.cle}` }]));
  const apres = {
    ventes: [{ ...donnees.ventes[0], total: 90_000, parMode: { especes: 65_000, mobile: 20_000, carte: 5_000 } }],
    depenses: [
      { ...donnees.depenses[0], montant: 27_000 },
      { ...donnees.depenses[1], supprimee: true },
    ],
  };
  const { operations, resume } = planifierImport(apres, deja, mapping);
  assert.deepStrictEqual(resume, { nouveau: 0, modifie: 2, supprime: 1, 'a-jour': 0 });
  const sup = operations.find(o => o.statut === 'supprime');
  assert.strictEqual(sup.ecritureId, 'e-depense:d2');
});

test('dépense supprimée jamais importée : ignorée', () => {
  const { operations } = planifierImport({ depenses: [{ ...donnees.depenses[0], supprimee: true }] }, new Map(), mapping);
  assert.strictEqual(operations.length, 0);
});

test('mapping : surcharge partielle, clés inconnues ignorées', () => {
  const m = fusionnerMapping({ charges: { gaz: '6052', pirate: '999' }, inconnu: 'x' });
  assert.strictEqual(m.charges.gaz, '6052');
  assert.strictEqual(m.charges['marche-vivres'], MAPPING_DEFAUT.charges['marche-vivres']);
  assert.ok(!('pirate' in m.charges) && !('inconnu' in m));
});
