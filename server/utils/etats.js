// États financiers SYSCOHADA (bilan, compte de résultat, soldes de gestion).
// Logique pure, sans Firestore : testée dans test/etats.test.js. Les routes (routes/rapports.js)
// et la clôture (utils/cloture.js) s'appuient toutes dessus, pour que le résultat affiché, le
// résultat du bilan, celui des soldes de gestion et celui de la clôture soient le même chiffre.

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const cmpNumero = (a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true });

// Solde (débit − crédit) de chaque compte.
function soldesDepuisEcritures(ecritures) {
  const soldes = new Map();
  for (const ec of ecritures) {
    for (const l of ec.lignes || []) {
      soldes.set(l.compte, round2((soldes.get(l.compte) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0)));
    }
  }
  return soldes;
}

// Classe d'un compte : celle du plan comptable, sinon le premier chiffre du numéro (un compte
// absent du plan ne doit pas disparaître des états — il fausserait l'équilibre en silence).
function classeDe(numero, plan) {
  const c = plan && plan.get(numero);
  if (c && Number(c.classe)) return Number(c.classe);
  return Number(String(numero)[0]) || 0;
}

function libelleDe(numero, plan) {
  const c = plan && plan.get(numero);
  return c ? c.libelle : '(compte hors plan)';
}

// Classe 8 (Hors Activités Ordinaires) : 81/83/85/87/89 sont des charges (valeur comptable des
// cessions, charges HAO, dotations HAO, participation, impôt sur le résultat), 82/84/86/88 des
// produits (produits de cession, produits HAO, reprises HAO, subventions d'équilibre).
function estCompteResultat(numero, plan) {
  const classe = classeDe(numero, plan);
  return classe === 6 || classe === 7 || classe === 8;
}
function estCharge(numero, plan) {
  const classe = classeDe(numero, plan);
  if (classe === 6) return true;
  if (classe === 8) return Number(String(numero)[1]) % 2 === 1;
  return false;
}

// ─── Compte de résultat ──────────────────────────────────────────────────────────────

function calculerResultat(soldes, plan) {
  const charges = [];
  const produits = [];
  for (const [numero, solde] of soldes) {
    if (!solde || !estCompteResultat(numero, plan)) continue;
    const hao = classeDe(numero, plan) === 8;
    if (estCharge(numero, plan)) charges.push({ numero, libelle: libelleDe(numero, plan), montant: solde, hao });
    else produits.push({ numero, libelle: libelleDe(numero, plan), montant: round2(-solde), hao });
  }
  const totalCharges = round2(charges.reduce((s, l) => s + l.montant, 0));
  const totalProduits = round2(produits.reduce((s, l) => s + l.montant, 0));
  return {
    charges: charges.sort(cmpNumero),
    produits: produits.sort(cmpNumero),
    totalCharges,
    totalProduits,
    resultatNet: round2(totalProduits - totalCharges),
  };
}

// ─── Bilan ───────────────────────────────────────────────────────────────────────────

// Comptes d'amortissement / dépréciation, présentés en déduction de l'actif (brut − amort. = net)
// et non au passif : 28 (amortissements), 29 (dépréciations des immobilisations), 39 (stocks),
// 49 (tiers), 59 (trésorerie).
const PREFIXES_DEDUCTION = ['28', '29', '39', '49', '59'];
const estDeduction = (numero) => PREFIXES_DEDUCTION.some(p => String(numero).startsWith(p));

const RUBRIQUES_ACTIF = [
  { code: 'AI', libelle: 'Actif immobilisé', classes: [2] },
  { code: 'AC', libelle: 'Actif circulant (stocks et créances)', classes: [3, 4] },
  { code: 'TA', libelle: 'Trésorerie – Actif', classes: [5] },
];
const RUBRIQUES_PASSIF = [
  { code: 'CP', libelle: 'Capitaux propres et ressources assimilées' },
  { code: 'DF', libelle: 'Dettes financières et ressources assimilées' },
  { code: 'PC', libelle: 'Passif circulant (dettes fournisseurs, fiscales, sociales…)' },
  { code: 'TP', libelle: 'Trésorerie – Passif' },
];

// Le résultat de l'exercice en cours est porté au passif (capitaux propres) tant que l'exercice
// n'est pas clôturé : sans lui, l'actif n'égale jamais le passif en cours d'année. Une perte
// apparaît en négatif dans les capitaux propres, comme dans la présentation SYSCOHADA.
function calculerBilan(soldes, plan) {
  const actif = Object.fromEntries(RUBRIQUES_ACTIF.map(r => [r.code, { ...r, lignes: [], deductions: [], brut: 0, amortissements: 0, net: 0 }]));
  const passif = Object.fromEntries(RUBRIQUES_PASSIF.map(r => [r.code, { ...r, lignes: [], total: 0 }]));
  const ajouterPassif = (code, numero, libelle, montant) => {
    passif[code].lignes.push({ numero, libelle, montant: round2(montant) });
    passif[code].total = round2(passif[code].total + montant);
  };

  for (const [numero, solde] of soldes) {
    if (!solde) continue;
    const classe = classeDe(numero, plan);
    if (classe < 1 || classe > 5) continue;
    const libelle = libelleDe(numero, plan);

    if (classe === 1) {
      // 109 (capital souscrit non appelé) est une créance sur les associés → actif.
      if (String(numero).startsWith('109')) {
        actif.AC.lignes.push({ numero, libelle, montant: solde });
        actif.AC.brut = round2(actif.AC.brut + solde);
        continue;
      }
      const code = Number(String(numero).slice(0, 2)) >= 16 ? 'DF' : 'CP';
      ajouterPassif(code, numero, libelle, -solde); // créditeur = positif ; débiteur (report déficitaire) = négatif
      continue;
    }

    const rubrique = RUBRIQUES_ACTIF.find(r => r.classes.includes(classe)).code;
    if (estDeduction(numero)) {
      // Normalement créditeur : vient en diminution de la valeur brute de la rubrique.
      actif[rubrique].deductions.push({ numero, libelle, montant: round2(-solde) });
      actif[rubrique].amortissements = round2(actif[rubrique].amortissements - solde);
      continue;
    }
    if (solde > 0 || classe === 2 || classe === 3) {
      actif[rubrique].lignes.push({ numero, libelle, montant: solde });
      actif[rubrique].brut = round2(actif[rubrique].brut + solde);
    } else if (classe === 4) {
      ajouterPassif('PC', numero, libelle, -solde);
    } else {
      ajouterPassif('TP', numero, libelle, -solde); // découvert / concours bancaires
    }
  }

  const resultat = calculerResultat(soldes, plan);
  const resultatEnCours = resultat.charges.length + resultat.produits.length > 0;
  if (resultatEnCours) {
    ajouterPassif('CP', '13', `Résultat de l'exercice (${resultat.resultatNet >= 0 ? 'bénéfice' : 'perte'}, non encore affecté)`, resultat.resultatNet);
  }

  for (const r of Object.values(actif)) {
    r.lignes.sort(cmpNumero);
    r.deductions.sort(cmpNumero);
    r.net = round2(r.brut - r.amortissements);
  }
  for (const r of Object.values(passif)) r.lignes.sort(cmpNumero);

  const totalActif = round2(Object.values(actif).reduce((s, r) => s + r.net, 0));
  const totalPassif = round2(Object.values(passif).reduce((s, r) => s + r.total, 0));
  return {
    actif: Object.values(actif),
    passif: Object.values(passif),
    totalActif,
    totalPassif,
    resultatExercice: resultat.resultatNet,
    resultatInclus: resultatEnCours,
    ecart: round2(totalActif - totalPassif),
    equilibre: Math.abs(totalActif - totalPassif) < 0.01,
  };
}

// ─── État des soldes de gestion ──────────────────────────────────────────────────────
// Classement par préfixe (le plus long qui correspond l'emporte), avec un repli par classe :
// TOUT compte 6/7/8 mouvementé est classé quelque part, donc le résultat net des soldes de
// gestion est toujours égal à celui du compte de résultat.

const ESG_PREFIXES = [
  ['701', 'ventesMarchandises'],
  ['601', 'achatsMarchandises'], ['6031', 'achatsMarchandises'],
  ['702', 'productionVendue'], ['703', 'productionVendue'], ['704', 'productionVendue'],
  ['705', 'productionVendue'], ['706', 'productionVendue'], ['707', 'productionVendue'],
  ['709', 'productionVendue'],
  ['72', 'productionVendue'], ['73', 'productionVendue'],
  ['71', 'autresProduitsExploitation'], ['75', 'autresProduitsExploitation'],
  ['602', 'achatsEtServicesExterieurs'], ['6032', 'achatsEtServicesExterieurs'],
  ['604', 'achatsEtServicesExterieurs'], ['605', 'achatsEtServicesExterieurs'],
  ['608', 'achatsEtServicesExterieurs'], ['61', 'achatsEtServicesExterieurs'],
  ['62', 'achatsEtServicesExterieurs'], ['63', 'achatsEtServicesExterieurs'],
  ['64', 'impotsEtTaxes'],
  ['65', 'autresChargesExploitation'],
  ['66', 'chargesPersonnel'],
  ['67', 'chargesFinancieres'], ['697', 'chargesFinancieres'],
  ['68', 'dotationsExploitation'], ['691', 'dotationsExploitation'],
  ['695', 'impotResultat'],
  ['77', 'produitsFinanciers'], ['797', 'produitsFinanciers'],
  ['78', 'reprisesExploitation'], ['791', 'reprisesExploitation'], ['798', 'reprisesExploitation'], ['799', 'reprisesExploitation'],
  ['81', 'chargesHAO'], ['83', 'chargesHAO'], ['85', 'chargesHAO'],
  ['82', 'produitsHAO'], ['84', 'produitsHAO'], ['86', 'produitsHAO'], ['88', 'produitsHAO'],
  ['87', 'participation'],
  ['89', 'impotResultat'],
].sort((a, b) => b[0].length - a[0].length);

function groupeESG(numero, plan) {
  const n = String(numero);
  const hit = ESG_PREFIXES.find(([p]) => n.startsWith(p));
  if (hit) return hit[1];
  const classe = classeDe(numero, plan);
  if (classe === 6) return 'autresChargesExploitation';
  if (classe === 7) return 'autresProduitsExploitation';
  return estCharge(numero, plan) ? 'chargesHAO' : 'produitsHAO';
}

function calculerESG(soldes, plan) {
  const g = {};
  const detail = {};
  for (const [numero, solde] of soldes) {
    if (!solde || !estCompteResultat(numero, plan)) continue;
    const groupe = groupeESG(numero, plan);
    // Charges en positif quand débitrices, produits en positif quand créditeurs.
    const charge = estCharge(numero, plan);
    const montant = charge ? solde : -solde;
    g[groupe] = round2((g[groupe] || 0) + montant);
    (detail[groupe] = detail[groupe] || []).push({ numero, libelle: libelleDe(numero, plan), montant: round2(montant) });
  }
  const v = (k) => g[k] || 0;

  const ventesMarchandises = v('ventesMarchandises');
  const achatsMarchandises = v('achatsMarchandises');
  const margeCommerciale = round2(ventesMarchandises - achatsMarchandises);
  const productionExercice = v('productionVendue');
  const achatsEtServicesExterieurs = v('achatsEtServicesExterieurs');
  const valeurAjoutee = round2(margeCommerciale + productionExercice - achatsEtServicesExterieurs);
  const chargesPersonnel = v('chargesPersonnel');
  const impotsEtTaxes = v('impotsEtTaxes');
  const excedentBrutExploitation = round2(valeurAjoutee - chargesPersonnel - impotsEtTaxes);
  const reprisesExploitation = v('reprisesExploitation');
  const dotationsExploitation = v('dotationsExploitation');
  const autresProduitsExploitation = v('autresProduitsExploitation');
  const autresChargesExploitation = v('autresChargesExploitation');
  const resultatExploitation = round2(excedentBrutExploitation + reprisesExploitation - dotationsExploitation
    + autresProduitsExploitation - autresChargesExploitation);
  const produitsFinanciers = v('produitsFinanciers');
  const chargesFinancieres = v('chargesFinancieres');
  const resultatFinancier = round2(produitsFinanciers - chargesFinancieres);
  const resultatActivitesOrdinaires = round2(resultatExploitation + resultatFinancier);
  const produitsHAO = v('produitsHAO');
  const chargesHAO = v('chargesHAO');
  const resultatHAO = round2(produitsHAO - chargesHAO);
  const participation = v('participation');
  const impotResultat = v('impotResultat');
  const resultatNet = round2(resultatActivitesOrdinaires + resultatHAO - participation - impotResultat);

  return {
    ventesMarchandises, achatsMarchandises, margeCommerciale,
    productionExercice, achatsEtServicesExterieurs, valeurAjoutee,
    chargesPersonnel, impotsEtTaxes, excedentBrutExploitation,
    reprisesExploitation, dotationsExploitation, autresProduitsExploitation, autresChargesExploitation,
    resultatExploitation,
    produitsFinanciers, chargesFinancieres, resultatFinancier,
    resultatActivitesOrdinaires,
    produitsHAO, chargesHAO, resultatHAO,
    participation, impotResultat, resultatNet,
    detail,
  };
}

module.exports = {
  round2, soldesDepuisEcritures, classeDe, estCompteResultat, estCharge,
  calculerResultat, calculerBilan, calculerESG,
};
