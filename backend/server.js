// server.js — Point d'entrée principal
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middlewares ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Désactiver le cache sur toutes les routes /api ──
// Empêche les HTTP 304 qui renvoient des données obsolètes
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Fichiers uploadés (factures livraisons, bordereaux banque)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes API ──
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/clients',       require('./routes/clients'));
app.use('/api/ventes',        require('./routes/ventes'));
app.use('/api/livraisons',    require('./routes/livraisons'));
app.use('/api/recouvrements', require('./routes/recouvrements'));
app.use('/api/stock',         require('./routes/stock'));
app.use('/api/pertes',        require('./routes/pertes'));
app.use('/api/banque',        require('./routes/banque'));
app.use('/api/prix',          require('./routes/prix'));
app.use('/api/utilisateurs',  require('./routes/utilisateurs'));
app.use('/api/rapports',      require('./routes/rapports'));
app.use('/api/journal',       require('./routes/journal'));
app.use('/api/fournisseurs',  require('./routes/fournisseurs'));
app.use('/api/prix-achat',    require('./routes/prixAchat'));
app.use('/api/factures',      require('./routes/factures'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/avances',       require('./routes/avances'));
app.use('/api/depenses',      require('./routes/depenses'));
app.use('/api/backup',        require('./routes/backup'));
app.use('/api/exports',       require('./routes/exports'));
app.use('/api/sauvegarde',    require('./routes/sauvegarde'));

// ── Santé ──
app.get('/api/ping', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── Frontend (dev + production) ──
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ── Démarrage ──
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`   Mode : ${process.env.NODE_ENV || 'development'}`);
});
