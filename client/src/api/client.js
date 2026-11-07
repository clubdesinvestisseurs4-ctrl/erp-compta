import { TOKEN_KEY, forceLogout } from '../utils/session';

// Backend : Render (principal, gratuit — s'endort après 15 min sans visite) + relais AWS Lambda
// (toujours chaud), même schéma que Cook Africa. L'ancien Cloud Run (VITE_API_BASE pointait
// dessus) est abandonné depuis la coupure de la facturation GCP : variables renommées exprès
// pour qu'une ancienne valeur restée sur Vercel ne le réactive pas.
const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const sansSlash = (u) => (u || '').replace(/\/+$/, '');
const API_PRINCIPALE = sansSlash(import.meta.env.VITE_API_URL || (local ? 'http://localhost:3002' : 'https://erp-compta.onrender.com'));
const API_RELAIS = local ? '' : sansSlash(import.meta.env.VITE_API_FALLBACK_URL || '');

let API_BASE = API_PRINCIPALE;

// Au démarrage : si Render ne répond pas en 4 s (il dort), on passe sur AWS tout de suite ;
// on revient sur Render dès qu'il est réveillé (vérifié toutes les 60 s).
async function principaleRepond(timeoutMs) {
  try {
    const r = await fetch(`${API_PRINCIPALE}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function initBackend() {
  if (!API_RELAIS) return;
  if (!(await principaleRepond(4000))) API_BASE = API_RELAIS;
  setInterval(async () => {
    if (API_BASE === API_RELAIS && (await principaleRepond(8000))) API_BASE = API_PRINCIPALE;
  }, 60_000);
}

async function fetchAvecRelais(path, options) {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    // Panne réseau sur Render : une seule nouvelle tentative, sur le relais.
    if (!API_RELAIS || API_BASE === API_RELAIS) throw err;
    API_BASE = API_RELAIS;
    return fetch(`${API_BASE}${path}`, options);
  }
}

// Le login peut légitimement renvoyer 401 (identifiants invalides) sans que
// l'utilisateur n'ait jamais eu de session — ne pas le traiter comme une expiration.
function handleUnauthorized(path, status) {
  if (status === 401 && path !== '/api/auth/login') {
    forceLogout();
    return true;
  }
  return false;
}

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetchAvecRelais(path, { ...options, headers });

  if (handleUnauthorized(path, res.status)) {
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.error) || `Erreur ${res.status}`;
    const error = new Error(message);
    if (data && data.details) error.details = data.details;
    throw error;
  }

  return data;
}

async function uploadFile(path, formData) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetchAvecRelais(path, { method: 'POST', headers, body: formData });

  if (handleUnauthorized(path, res.status)) {
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.error) || `Erreur ${res.status}`;
    const error = new Error(message);
    if (data && data.details) error.details = data.details;
    throw error;
  }

  return data;
}

async function downloadFile(path, filename) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetchAvecRelais(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (handleUnauthorized(path, res.status)) {
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // réponse non-JSON, on garde le message générique
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  uploadFile,
  downloadFile,
};

// Valeur courante (Render ou relais) : lue au moment de l'appel, pas figée à l'import.
export function getApiBase() { return API_BASE; }
