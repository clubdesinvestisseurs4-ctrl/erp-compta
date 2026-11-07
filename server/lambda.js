// Point d'entrée AWS Lambda — enveloppe l'app Express (server.js) avec serverless-http,
// même modèle que Cook Africa. Relais pendant qu'un Render gratuit endormi se réveille ;
// Render lance server.js directement.
const serverless = require('serverless-http');
const app = require('./server');

module.exports.handler = serverless(app);
