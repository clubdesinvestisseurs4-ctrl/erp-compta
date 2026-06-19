require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3002;

// ─── Middlewares ───────────────────────────────────────────────────────────────

// Render (et autres reverse proxies) injectent X-Forwarded-For
app.set('trust proxy', 1);

app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    /\.vercel\.app$/,
    /\.web\.app$/,
  ],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

// Rate limiting strict pour auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives de connexion.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// authLimiter appliqué uniquement au login (anti brute-force)
app.post('/api/auth/login', authLimiter);
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/societes', require('./routes/societes'));
app.use('/api/comptes',  require('./routes/comptes'));
app.use('/api/journaux', require('./routes/journaux'));
app.use('/api/ecritures', require('./routes/ecritures'));
app.use('/api/rapports', require('./routes/rapports'));
app.use('/api/employes', require('./routes/employes'));
app.use('/api/pointages', require('./routes/pointages'));
app.use('/api/paie', require('./routes/paie'));
app.use('/api/tiers', require('./routes/tiers'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/cloture', require('./routes/cloture'));
app.use('/api/lettrage', require('./routes/lettrage'));
app.use('/api/factures', require('./routes/factures'));
app.use('/api/rapprochement', require('./routes/rapprochement'));
app.use('/api/export', require('./routes/export'));
app.use('/api/modeles', require('./routes/modeles'));

// Health check (utile pour Render)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ERP Compta API' });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Error handler global
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅  ERP Compta API démarrée sur le port ${PORT}`);
  console.log(`📌  Health check : http://localhost:${PORT}/health`);
});
