// Client serveur-à-serveur vers l'API de App-Gestion-Employees, source de vérité pour le
// personnel et le pointage. Authentification par clé partagée (X-Service-Key), pas de JWT
// utilisateur — voir server/middleware/serviceAuth.js côté App-Gestion-Employees.
const BASE_URL = process.env.GESTION_EMPLOYEES_API_URL || 'https://gestionemployeesapi.onrender.com';
const API_KEY = process.env.GESTION_EMPLOYEES_API_KEY;

async function call(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': API_KEY || '',
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Erreur ${res.status} (App Gestion Employés)`);
  }
  return data;
}

function getEmployes(etablissement) {
  const qs = etablissement ? `?etablissement=${encodeURIComponent(etablissement)}` : '';
  return call(`/api/integration/employes${qs}`);
}

function getPointages(etablissement, periode) {
  const params = new URLSearchParams({ etablissement });
  if (periode) params.set('periode', periode);
  return call(`/api/integration/pointages?${params.toString()}`);
}

function getPaieEstimations(etablissement, periode) {
  const params = new URLSearchParams({ etablissement, periode });
  return call(`/api/integration/paie?${params.toString()}`);
}

function decrementerAvance(employeId, montant) {
  return call('/api/integration/avances/decrementer', {
    method: 'POST',
    body: JSON.stringify({ employeId, montant }),
  });
}

module.exports = { getEmployes, getPointages, getPaieEstimations, decrementerAvance };
