// config/db.js — Connexion MySQL avec pool (compatible Aiven / Railway / local)
const mysql = require('mysql2/promise');
const fs    = require('fs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// En production, on accepte plusieurs conventions de noms de variables
// selon l'hébergeur (Aiven utilise généralement des noms génériques,
// Railway utilise MYSQLHOST/MYSQLPORT/etc., mais parfois MYSQL_DATABASE
// avec underscore selon comment les variables ont été copiées/référencées)
const host     = isProduction ? (process.env.MYSQLHOST     || process.env.DB_HOST)     : process.env.DB_HOST;
const port     = isProduction ? (process.env.MYSQLPORT     || process.env.DB_PORT)     : process.env.DB_PORT;
const user     = isProduction ? (process.env.MYSQLUSER     || process.env.DB_USER)     : process.env.DB_USER;
const password = isProduction ? (process.env.MYSQLPASSWORD || process.env.DB_PASSWORD) : process.env.DB_PASSWORD;
const database = isProduction
  ? (process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME)
  : process.env.DB_NAME;

// Avertissement clair si une variable critique manque, pour éviter de chercher
// à l'aveugle dans les logs en cas de mauvaise configuration sur l'hébergeur
if (isProduction) {
  const manquantes = [];
  if (!host) manquantes.push('MYSQLHOST');
  if (!user) manquantes.push('MYSQLUSER');
  if (!password) manquantes.push('MYSQLPASSWORD');
  if (!database) manquantes.push('MYSQLDATABASE ou MYSQL_DATABASE');
  if (manquantes.length) {
    console.error('⚠️  Variables MySQL manquantes :', manquantes.join(', '));
  } else {
    console.log(`ℹ️  Connexion MySQL configurée — host: ${host}, database: ${database}`);
  }
}

// Aiven exige une connexion chiffrée (SSL). Le certificat CA peut être fourni
// soit en chemin de fichier (DB_SSL_CA_PATH), soit directement en contenu
// base64/texte dans une variable d'environnement (DB_SSL_CA), pratique
// quand on ne peut pas committer de fichier .pem sur l'hébergeur.
let sslConfig = undefined;
if (process.env.DB_SSL_CA) {
  sslConfig = { ca: process.env.DB_SSL_CA };
} else if (process.env.DB_SSL_CA_PATH && fs.existsSync(process.env.DB_SSL_CA_PATH)) {
  sslConfig = { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') };
} else if (process.env.DB_USE_SSL === 'true') {
  // Repli : SSL activé sans vérification stricte du certificat (suffisant pour Aiven
  // en pratique, mais le CA explicite ci-dessus est préférable si disponible)
  sslConfig = { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host, port, user, password, database,
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+00:00',
});

// Vérification au démarrage
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connecté'); conn.release(); })
  .catch(err => console.error('❌ Erreur MySQL :', err.message));

module.exports = pool;
