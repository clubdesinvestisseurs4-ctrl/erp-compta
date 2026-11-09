// Pont Cook Africa → écritures comptables. Logique pure (testée dans test/pont-cookafrica.test.js).
//
// L'app de gestion saisit des ENTRÉES (factures payées) et des SORTIES (dépenses). Le comptable a
// besoin d'ÉCRITURES. Ce module traduit les unes en les autres :
//   - une écriture de ventes par jour : Débit trésorerie (selon le mode de paiement) / Crédit 7062 ;
//   - une écriture par dépense : Débit compte de charge (selon la catégorie) / Crédit trésorerie.
// Chaque opération a une clé stable (`ventes:2026-11-05`, `depense:<id>`) mémorisée à l'import :
// réimporter la même période ne crée jamais de doublon, et une opération modifiée ou supprimée
// dans l'app après l'import est détectée (extourne de l'ancienne écriture, puis nouvelle écriture).

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Correspondances par défaut — À FAIRE VALIDER PAR LE COMPTABLE. Surchargeables par société
// (champ `mappingCookAfrica` du document société) sans toucher au code.
const MAPPING_DEFAUT = {
  compteVentes: '7062',               // Prestations de restauration
  journalVentes: 'VE',
  journalCaisse: 'CA',                // dépenses payées en espèces
  journalBanque: 'BQ',                // dépenses payées autrement
  tresorerie: {                       // mode de paiement Cook Africa → compte de trésorerie
    especes: '571',                   // Caisse
    mobile: '532',                    // Mobile money
    carte: '512',                     // Banque (encaissements carte versés sur le compte)
    virement: '512',                  // Banque
  },
  charges: {                          // catégorie de dépense Cook Africa → compte de charge
    'marche-vivres': '6011',          // Achats de denrées alimentaires
    'achat-boissons': '6013',         // Achats de boissons
    gaz: '605',                       // Autres achats (énergie)
    'electricite-eau': '605',         // Autres achats (eau, électricité)
    transport: '618',                 // Autres frais de transport
    salaires: '661',                  // Salaires
    'entretien-materiel': '624',      // Entretien, réparations et maintenance
    autre: '638',                     // Autres charges externes
  },
};

const LIBELLES_MODE = { especes: 'espèces', mobile: 'mobile money', carte: 'carte', virement: 'virement' };

// Ne garde que les clés connues (une surcharge ne peut pas ajouter de champ arbitraire).
function fusionnerMapping(surcharge) {
  const s = surcharge && typeof surcharge === 'object' ? surcharge : {};
  const choisir = (defaut, src) => Object.fromEntries(Object.keys(defaut).map(k => [k, String((src && src[k]) || defaut[k])]));
  return {
    compteVentes: String(s.compteVentes || MAPPING_DEFAUT.compteVentes),
    journalVentes: String(s.journalVentes || MAPPING_DEFAUT.journalVentes),
    journalCaisse: String(s.journalCaisse || MAPPING_DEFAUT.journalCaisse),
    journalBanque: String(s.journalBanque || MAPPING_DEFAUT.journalBanque),
    tresorerie: choisir(MAPPING_DEFAUT.tresorerie, s.tresorerie),
    charges: choisir(MAPPING_DEFAUT.charges, s.charges),
  };
}

const compteTresorerie = (mapping, mode) => mapping.tresorerie[mode] || mapping.tresorerie.especes;

function ecritureVentes(jour, mapping) {
  const lignes = [];
  const parCompte = new Map();
  for (const [mode, montant] of Object.entries(jour.parMode || {})) {
    if (!montant) continue;
    const compte = compteTresorerie(mapping, mode);
    const l = parCompte.get(compte) || { compte, libelle: [], debit: 0, credit: 0 };
    l.debit = round2(l.debit + montant);
    l.libelle.push(LIBELLES_MODE[mode] || mode);
    parCompte.set(compte, l);
  }
  for (const l of parCompte.values()) lignes.push({ ...l, libelle: `Encaissements ${l.libelle.join(' + ')}` });
  lignes.push({ compte: mapping.compteVentes, libelle: 'Ventes restaurant', debit: 0, credit: round2(jour.total) });
  return {
    journalCode: mapping.journalVentes,
    date: jour.date,
    libelle: `Ventes Cook Africa du ${jour.date} (${jour.nombre} facture${jour.nombre > 1 ? 's' : ''})`,
    pieceRef: `CA-Z-${jour.date}`,
    lignes,
  };
}

function ecritureDepense(d, mapping) {
  const compteCharge = mapping.charges[d.categorie] || mapping.charges.autre;
  return {
    journalCode: d.modePaiement === 'especes' ? mapping.journalCaisse : mapping.journalBanque,
    date: d.date,
    libelle: `${d.libelle} (Cook Africa)`,
    pieceRef: `CA-DEP-${d.id}`,
    lignes: [
      { compte: compteCharge, libelle: d.libelle, debit: round2(d.montant), credit: 0 },
      { compte: compteTresorerie(mapping, d.modePaiement), libelle: d.libelle, debit: 0, credit: round2(d.montant) },
    ],
  };
}

// Empreinte de ce qui compte comptablement : si elle change après l'import, l'écriture est refaite.
const signatureVentes = (j) => JSON.stringify([j.total, Object.entries(j.parMode || {}).filter(([, v]) => v).sort()]);
const signatureDepense = (d) => [d.date, d.categorie, d.montant, d.modePaiement, d.libelle].join('|');

// `donnees` : réponse de GET /api/integration/journal côté Cook Africa.
// `dejaImportes` : Map clé → { signature, ecritureId } des imports précédents.
// Retourne la liste des opérations avec leur statut :
//   nouveau   → écriture à créer
//   modifie   → extourner `ecritureId`, puis créer la nouvelle écriture
//   supprime  → extourner `ecritureId` (dépense supprimée dans l'app)
//   a-jour    → déjà importé à l'identique, rien à faire
function planifierImport(donnees, dejaImportes, mapping) {
  const ops = [];
  const traiter = (cle, signature, ecriture, montant, supprimee = false) => {
    const prec = dejaImportes.get(cle);
    if (supprimee) {
      if (prec && !prec.annule) ops.push({ cle, statut: 'supprime', ecritureId: prec.ecritureId, montant, ecriture: null });
      return;
    }
    if (!prec || prec.annule) ops.push({ cle, statut: 'nouveau', signature, montant, ecriture });
    else if (prec.signature !== signature) ops.push({ cle, statut: 'modifie', signature, montant, ecritureId: prec.ecritureId, ecriture });
    else ops.push({ cle, statut: 'a-jour', signature, montant, ecriture });
  };

  for (const j of donnees.ventes || []) {
    if (!j.total) continue;
    traiter(`ventes:${j.date}`, signatureVentes(j), ecritureVentes(j, mapping), round2(j.total));
  }
  for (const d of donnees.depenses || []) {
    if (!d.montant) continue;
    traiter(`depense:${d.id}`, signatureDepense(d), ecritureDepense(d, mapping), round2(d.montant), d.supprimee);
  }

  const resume = { nouveau: 0, modifie: 0, supprime: 0, 'a-jour': 0 };
  ops.forEach(o => { resume[o.statut] += 1; });
  return { operations: ops, resume };
}

// Comptes utilisés par le mapping (contrôle qu'ils existent dans le plan comptable avant import).
function comptesDuMapping(mapping) {
  return [...new Set([mapping.compteVentes, ...Object.values(mapping.tresorerie), ...Object.values(mapping.charges)])];
}

// Fenêtre de la synchronisation automatique : les `jours` derniers jours jusqu'à hier (heure
// d'Abidjan = UTC), jamais avant `depuis`, découpée par année (une écriture = un exercice).
// Rejouer une fenêtre déjà importée ne fait rien : seules les corrections sont reprises.
function periodesSync(maintenant, depuis, jours = 35) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const hier = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() - 1));
  const debutFenetre = new Date(hier.getTime() - (jours - 1) * 86_400_000);
  let debut = iso(debutFenetre) < depuis ? depuis : iso(debutFenetre);
  const fin = iso(hier);
  const periodes = [];
  while (debut <= fin) {
    const finAnnee = `${debut.slice(0, 4)}-12-31`;
    const f = finAnnee < fin ? finAnnee : fin;
    periodes.push({ debut, fin: f });
    debut = `${Number(debut.slice(0, 4)) + 1}-01-01`;
  }
  return periodes;
}

module.exports = {
  periodesSync,
  MAPPING_DEFAUT, fusionnerMapping, planifierImport, comptesDuMapping,
  ecritureVentes, ecritureDepense,
};
