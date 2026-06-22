const TOKEN_KEY = 'erp_token';
const USER_KEY = 'erp_user';

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Coupe la session immédiatement (token expiré ou rejeté par le serveur) et renvoie vers le login.
function forceLogout() {
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// Lit la date d'expiration (claim "exp", en ms) d'un JWT sans vérifier sa signature.
function getTokenExpiryMs(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export { TOKEN_KEY, USER_KEY, saveSession, clearSession, forceLogout, getTokenExpiryMs };
