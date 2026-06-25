const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, admin } = require('../firebase-admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/debug-fs — diagnostic temporaire, à retirer une fois le problème résolu
router.get('/debug-fs', async (req, res) => {
  try {
    const projectId = admin.app().options.credential.projectId || process.env.FIREBASE_PROJECT_ID;

    const tokenResult = await admin.app().options.credential.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/utilisateurs`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenResult.access_token}` },
    });
    const body = await r.text();
    res.status(200).json({ projectId, httpStatus: r.status, body });
  } catch (err) {
    res.status(200).json({ caught: true, message: err.message, stack: err.stack });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Identifiants requis' });
    }

    const snapshot = await db
      .collection('utilisateurs')
      .where('username', '==', username.toLowerCase().trim())
      .where('actif', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    await userDoc.ref.update({ lastLogin: new Date().toISOString() });

    const token = jwt.sign(
      {
        id: userDoc.id,
        username: user.username,
        nom: user.nom,
        role: user.role,
        societesAccess: user.societesAccess || [],
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: userDoc.id,
        username: user.username,
        nom: user.nom,
        role: user.role,
        societesAccess: user.societesAccess || [],
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — informations sur l'utilisateur connecté
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/seed — crée les utilisateurs initiaux (à appeler une seule fois)
router.post('/seed', async (req, res) => {
  try {
    const snapshot = await db.collection('utilisateurs').limit(1).get();
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Base déjà initialisée' });
    }

    const utilisateurs = [
      { username: 'admin',     nom: 'Administrateur ERP', role: 'admin',     password: 'Admin@2026!',     societesAccess: ['ohinene', 'cookafrica'] },
      { username: 'comptable', nom: 'Comptable Général',  role: 'comptable', password: 'Comptable@2026!', societesAccess: ['ohinene', 'cookafrica'] },
    ];

    const batch = db.batch();
    for (const u of utilisateurs) {
      const ref = db.collection('utilisateurs').doc();
      const passwordHash = await bcrypt.hash(u.password, 10);
      batch.set(ref, {
        username: u.username,
        nom: u.nom,
        role: u.role,
        societesAccess: u.societesAccess,
        passwordHash,
        actif: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
      });
    }
    await batch.commit();

    res.json({ message: 'Utilisateurs créés', count: utilisateurs.length });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
