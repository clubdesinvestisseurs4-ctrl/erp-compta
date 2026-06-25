const admin = require('firebase-admin');
const fs = require('fs');

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    const json = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8');
    return admin.credential.cert(JSON.parse(json));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const cleaned = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/\s/g, '');
    const json = Buffer.from(cleaned, 'base64').toString('utf8');
    return admin.credential.cert(JSON.parse(json));
  }
  return admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  });
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: loadCredential(),
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { db, admin };
