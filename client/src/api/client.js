import { TOKEN_KEY, forceLogout } from '../utils/session';

// Tolère un VITE_API_BASE se terminant par "/" (sinon les requêtes partent en double slash,
// ex: "https://host//api/societes" — certains bloqueurs de pub/proxys traitent ça comme suspect).
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3002').replace(/\/+$/, '');

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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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

  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });

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
  const res = await fetch(`${API_BASE}${path}`, {
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

export { API_BASE };
