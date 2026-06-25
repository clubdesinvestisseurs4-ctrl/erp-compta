const admin = require('firebase-admin');

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
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
