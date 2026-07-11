// routes/prixAchat.js — Prix d'achat par fournisseur, avec historique
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

// GET /api/prix-achat — historique complet (avec nom fournisseur)
router.get('/', auth, async (req, res) => {
  try {
    const { fournisseur_id } = req.query;
    let sql = `SELECT pa.*, f.nom as fournisseur_nom
               FROM prix_achat pa LEFT JOIN fournisseurs f ON pa.fournisseur_id = f.id WHERE 1=1`;
    const params = [];
    if (fournisseur_id) { sql += ' AND pa.fournisseur_id = ?'; params.push(fournisseur_id); }
    sql += ' ORDER BY pa.date_effet DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/prix-achat/actifs — prix actuel de chaque fournisseur
router.get('/actifs', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pa.*, f.nom as fournisseur_nom
       FROM prix_achat pa LEFT JOIN fournisseurs f ON pa.fournisseur_id = f.id
       WHERE pa.actif = 1 ORDER BY f.nom`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/prix-achat — nouveau prix (archive l'ancien pour ce fournisseur)
router.post('/', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { fournisseur_id, date_effet, prix_unitaire } = req.body;
    if (!fournisseur_id || !prix_unitaire || !date_effet)
      return res.status(400).json({ error: 'Fournisseur, prix et date requis' });

    await conn.query('UPDATE prix_achat SET actif = 0 WHERE fournisseur_id = ? AND actif = 1', [fournisseur_id]);
    const [result] = await conn.query(
      'INSERT INTO prix_achat (fournisseur_id, date_effet, prix_unitaire, actif) VALUES (?, ?, ?, 1)',
      [fournisseur_id, date_effet, prix_unitaire]
    );
    await conn.commit();
    await logAction(req.user, 'CREATE', 'prix_achat', `Nouveau prix d'achat: ${prix_unitaire} FCFA/carton`);

    const [newPrix] = await db.query(
      `SELECT pa.*, f.nom as fournisseur_nom FROM prix_achat pa
       LEFT JOIN fournisseurs f ON pa.fournisseur_id = f.id WHERE pa.id = ?`, [result.insertId]
    );
    res.status(201).json(newPrix[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
