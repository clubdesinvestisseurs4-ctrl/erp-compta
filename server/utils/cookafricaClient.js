// Client serveur-à-serveur vers l'API de cookafrica-app, source de vérité pour le chiffre
// d'affaires réel (factures payées). Authentification par clé partagée (X-Service-Key), pas de
// JWT utilisateur — voir server/middleware/serviceAuth.js côté cookafrica-app. Même mécanique
// que utils/gestionEmployeesClient.js.
const BASE_URL = process.env.COOKAFRICA_API_URL || 'https://cookafrica-api-667992371198.us-central1.run.app';
const API_KEY = process.env.COOKAFRICA_API_KEY;

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
    throw new Error((data && data.error) || `Erreur ${res.status} (Cook Africa)`);
  }
  return data;
}

// { debut, fin, total, nombre, parMode } — total des factures payées sur la période.
function getChiffreAffaires(debut, fin) {
  const params = new URLSearchParams({ debut, fin });
  return call(`/api/integration/ca?${params.toString()}`);
}

module.exports = { getChiffreAffaires };