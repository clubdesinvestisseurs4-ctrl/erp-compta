const ExcelJS = require('exceljs');

// Alias de noms de colonnes acceptés (insensibles à la casse et aux accents).
const HEADER_ALIASES = {
  numero: ['numero', 'numéro', 'compte', 'num', 'n°'],
  libelle: ['libelle', 'libellé', 'intitule', 'intitulé', 'designation', 'désignation'],
  classe: ['classe', 'cl'],
};

function normalize(str) {
  return String(str ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();
}

function findColumn(headerRow, field) {
  const aliases = HEADER_ALIASES[field].map(normalize);
  let index = -1;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (index === -1 && aliases.includes(normalize(cell.value))) {
      index = colNumber;
    }
  });
  return index;
}

function cellText(row, colIndex) {
  if (colIndex === -1) return '';
  const value = row.getCell(colIndex).value;
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim(); // rich text
  if (typeof value === 'object' && 'result' in value) return String(value.result).trim(); // formule
  return String(value).trim();
}

// Parse un fichier Excel (.xlsx) — colonnes Numéro / Libellé / Classe en première ligne —
// en comptes du plan comptable. Lève une erreur (avec err.details = liste de messages) si invalide.
async function parsePlanComptableExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('Fichier illisible. Seul le format .xlsx est accepté.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new Error('Le fichier est vide ou ne contient pas de données.');
  }

  const headerRow = sheet.getRow(1);
  const colNumero = findColumn(headerRow, 'numero');
  const colLibelle = findColumn(headerRow, 'libelle');
  const colClasse = findColumn(headerRow, 'classe');

  if (colNumero === -1 || colLibelle === -1) {
    throw new Error('Colonnes "Numéro" et "Libellé" introuvables sur la première ligne du fichier.');
  }

  const comptes = [];
  const erreurs = [];
  const numerosVus = new Set();

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const numero = cellText(row, colNumero);
    const libelle = cellText(row, colLibelle);

    if (!numero && !libelle) continue; // ligne vide, on l'ignore

    if (!numero) {
      erreurs.push(`Ligne ${i} : numéro de compte manquant.`);
      continue;
    }
    if (!/^\d+$/.test(numero)) {
      erreurs.push(`Ligne ${i} : numéro de compte invalide ("${numero}").`);
      continue;
    }
    if (!libelle) {
      erreurs.push(`Ligne ${i} : libellé manquant pour le compte ${numero}.`);
      continue;
    }
    if (numerosVus.has(numero)) {
      erreurs.push(`Ligne ${i} : le compte ${numero} apparaît plusieurs fois dans le fichier.`);
      continue;
    }

    let classe = colClasse !== -1 ? parseInt(cellText(row, colClasse), 10) : NaN;
    if (!classe || classe < 1 || classe > 8) {
      classe = parseInt(numero[0], 10);
    }
    if (!classe || classe < 1 || classe > 8) {
      erreurs.push(`Ligne ${i} : classe invalide pour le compte ${numero}.`);
      continue;
    }

    numerosVus.add(numero);
    comptes.push({ numero, libelle, classe });
  }

  if (erreurs.length) {
    const err = new Error(`Le fichier contient ${erreurs.length} erreur(s).`);
    err.details = erreurs;
    throw err;
  }

  if (comptes.length === 0) {
    throw new Error('Aucun compte valide trouvé dans le fichier.');
  }

  return comptes;
}

module.exports = { parsePlanComptableExcel };
