// Vérifie que l'utilisateur authentifié a accès à la société demandée (req.params.societeId).
// Le rôle 'admin' a accès à toutes les sociétés.
function requireSocieteAccess(req, res, next) {
  const { societeId } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (user.role === 'admin') {
    return next();
  }

  const societesAccess = user.societesAccess || [];
  if (!societesAccess.includes(societeId)) {
    return res.status(403).json({ error: 'Accès refusé à cette société' });
  }

  next();
}

module.exports = { requireSocieteAccess };
