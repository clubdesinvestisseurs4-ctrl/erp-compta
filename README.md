# ERP Compta — Ohinéné & Cook Africa

ERP de comptabilité générale (SYSCOHADA révisé), multi-société, pour l'Hôtel Ohinéné et Cook Africa.

- **Frontend** : Vue 3 + Vite (PWA) → `client/` → déployé sur **Vercel**
- **Backend** : Express.js REST API → `server/` → déployé sur **Render**
- **Base de données** : Firebase Firestore (accès via Admin SDK depuis le backend uniquement)

## Périmètre V1

Module **Comptabilité Générale** :
- Plan comptable SYSCOHADA (référentiel pré-chargé, personnalisable par société)
- Journaux (Achats, Ventes, Banque, Caisse, Opérations Diverses, À-Nouveaux)
- Saisie d'écritures comptables (équilibre débit/crédit obligatoire, numérotation automatique)
- Grand livre par compte
- Balance générale
- Bilan et Compte de résultat (synthèse par classes SYSCOHADA)

Les modules Tiers, Achats/Ventes (facturation), Trésorerie/Banque, Immobilisations, Paie, etc. viendront dans des itérations suivantes.

---

## 1. Setup Firebase

1. Créer un nouveau projet sur [Firebase Console](https://console.firebase.google.com/) (ex: `erp-compta-ohinene`).
2. Activer **Firestore Database** (mode natif, région la plus proche).
3. Aller dans **Paramètres du projet > Comptes de service** > "Générer une nouvelle clé privée" (JSON).
4. Depuis ce JSON, récupérer :
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (garder les `\n`, à mettre entre guillemets)

Aucune règle Firestore particulière n'est nécessaire côté client puisque le frontend ne parle qu'à l'API Express (Firestore reste privé, accessible uniquement via l'Admin SDK).

---

## 2. Lancer le backend en local

```bash
cd server
cp .env.example .env
# Remplir .env avec les valeurs Firebase + un JWT_SECRET aléatoire
npm install
npm run dev
```

L'API démarre sur `http://localhost:3002` (vérifier `/health`).

### Initialisation des données (à faire une seule fois, dans l'ordre)

```bash
# 1. Crée les utilisateurs admin / comptable
curl -X POST http://localhost:3002/api/auth/seed

# 2. Crée les sociétés Ohinéné et Cook Africa
curl -X POST http://localhost:3002/api/societes/seed

# 3. Se connecter pour récupérer un token
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2026!"}'

# 4. Initialiser le plan comptable SYSCOHADA pour chaque société (remplacer TOKEN)
curl -X POST http://localhost:3002/api/comptes/ohinene/seed -H "Authorization: Bearer TOKEN"
curl -X POST http://localhost:3002/api/comptes/cookafrica/seed -H "Authorization: Bearer TOKEN"

# 5. Initialiser les journaux pour chaque société
curl -X POST http://localhost:3002/api/journaux/ohinene/seed -H "Authorization: Bearer TOKEN"
curl -X POST http://localhost:3002/api/journaux/cookafrica/seed -H "Authorization: Bearer TOKEN"
```

Ces étapes peuvent aussi être faites depuis l'interface (page **Sociétés**, réservée au rôle `admin`).

### Identifiants par défaut (à changer en production)

- `admin` / `Admin@2026!` — rôle `admin`, accès aux 2 sociétés
- `comptable` / `Comptable@2026!` — rôle `comptable`, accès aux 2 sociétés

---

## 3. Lancer le frontend en local

```bash
cd client
npm install
npm run dev
```

L'app démarre sur `http://localhost:5173`. Créer un fichier `.env` dans `client/` si l'API n'est pas sur `http://localhost:3002` :

```
VITE_API_BASE=http://localhost:3002
```

---

## 4. Déploiement Backend → Render

1. Pousser le dépôt sur GitHub.
2. Sur [Render](https://render.com/), **New > Web Service**, connecter le repo.
3. Render détecte `server/render.yaml` (rootDir `server`, build `npm install`, start `node server.js`).
4. Ajouter manuellement dans les variables d'environnement du service :
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (avec les `\n`)
   - `CLIENT_URL` → URL Vercel du frontend (ex: `https://erp-compta.vercel.app`)
   - `JWT_SECRET` est généré automatiquement par `render.yaml`
5. Déployer, puis vérifier `https://<service>.onrender.com/health`.

---

## 5. Déploiement Frontend → Vercel

1. Sur [Vercel](https://vercel.com/), **New Project**, importer le repo.
2. Définir le **Root Directory** sur `client`.
3. Build command : `npm run build`, Output directory : `dist` (détecté automatiquement par Vite).
4. Ajouter la variable d'environnement :
   - `VITE_API_BASE` → URL Render du backend (ex: `https://erp-compta-api.onrender.com`)
5. Déployer.

Une fois déployé, refaire les étapes de seed (section 2) en pointant vers l'URL Render de production.

---

## Structure du projet

```
ERP-Compta/
├── server/     # API Express (Render)
│   ├── server.js
│   ├── firebase-admin.js
│   ├── middleware/   (auth, accès société)
│   ├── data/          (référentiel SYSCOHADA)
│   └── routes/        (auth, societes, comptes, journaux, ecritures, rapports)
└── client/     # PWA Vue 3 (Vercel)
    └── src/
        ├── stores/    (auth, société active)
        ├── api/       (client fetch)
        ├── views/     (Login, Dashboard, Plan comptable, Journaux, Écritures, Grand livre, Balance, Bilan/Résultat)
        └── components/
```
