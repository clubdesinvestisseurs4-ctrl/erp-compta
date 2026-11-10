// Client serveur-à-serveur vers l'API de cookafrica-app, source de vérité pour le chiffre
// d'affaires réel (factures payées). Authentification par clé partagée (X-Service-Key), pas de
// JWT utilisateur — voir server/middleware/serviceAuth.js côté cookafrica-app. Même mécanique
// que utils/gestionEmployeesClient.js.
// Render (principal, gratuit : peut dormir ~1 min) puis le relais AWS Lambda de Cook Africa,
// toujours chaud. Le relais n'est essayé que si Render ne répond pas à temps.
const BASE_URLS = [
  process.env.COOKAFRICA_API_URL || 'https://cookafrica-api.onrender.com',
  process.env.COOKAFRICA_API_FALLBACK_URL || 'https://xqlp5poieg.execute-api.eu-north-1.amazonaws.com',
].filter(Boolean);
const API_KEY = process.env.COOKAFRICA_API_KEY;
const TIMEOUT_PRINCIPAL_MS = 12_000;

async function appeler(base, path, timeoutMs) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': API_KEY || '' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    throw Object.assign(new Error((data && data.error) || `Erreur ${res.status} (Cook Africa)`), { status: res.status });
  }
  return data;
}

async function call(path) {
  let derniere;
  for (const [i, base] of BASE_URLS.entries()) {
    try {
      return await appeler(base, path, i === 0 && BASE_URLS.length > 1 ? TIMEOUT_PRINCIPAL_MS : 25_000);
    } catch (err) {
      // Une vraie réponse d'erreur (clé refusée, période invalide) ne se corrige pas en changeant
      // de serveur : seul un délai dépassé, une panne réseau, un 5xx ou un 429 (Render au réveil
      // ou quota par IP saturé) déclenche le relais.
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      derniere = err;
    }
  }
  throw new Error(`Cook Africa ne répond pas (${derniere && derniere.message})`);
}

// { debut, fin, total, nombre, parMode } — total des factures payées sur la période.
function getChiffreAffaires(debut, fin) {
  const params = new URLSearchParams({ debut, fin });
  return call(`/api/integration/ca?${params.toString()}`);
}

// { debut, fin, ventes: [{date,total,nombre,parMode}], depenses: [...] } — base du pont comptable.
function getJournal(debut, fin) {
  const params = new URLSearchParams({ debut, fin });
  return call(`/api/integration/journal?${params.toString()}`);
}

module.exports = { getChiffreAffaires, getJournal };