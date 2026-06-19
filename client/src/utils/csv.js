function escapeCsv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Génère un CSV (séparateur ;, BOM UTF-8 pour Excel) et déclenche son téléchargement dans le navigateur.
export function exportCsv(filename, rows, columns) {
  const header = columns.map(c => escapeCsv(c.label)).join(';');
  const lignes = rows.map(r => columns.map(c => escapeCsv(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  const BOM = String.fromCharCode(0xFEFF);
  const csv = BOM + [header, ...lignes].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
