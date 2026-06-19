const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Options de période pour un exercice donné : année complète + chaque mois calendaire.
// Chaque option porte ses propres dateDebut/dateFin (YYYY-MM-DD) prêtes à envoyer à l'API.
export function optionsPeriode(exercice) {
  const options = [
    { value: 'annee', label: 'Année complète', dateDebut: `${exercice}-01-01`, dateFin: `${exercice}-12-31` },
  ];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const dernierJour = new Date(exercice, m, 0).getDate();
    options.push({
      value: `mois-${mm}`,
      label: MOIS_LABELS[m - 1],
      dateDebut: `${exercice}-${mm}-01`,
      dateFin: `${exercice}-${mm}-${String(dernierJour).padStart(2, '0')}`,
    });
  }
  return options;
}
