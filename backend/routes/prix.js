// routes/prix.js
const router = require('express').Router();
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM prix_carton ORDER BY date_effet DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/prix/actifs — prix actuels par catégorie
router.get('/actifs', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM prix_carton WHERE actif = 1 ORDER BY categorie'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_effet, categorie, prix_unitaire } = req.body;
    if (!categorie || !prix_unitaire || !date_effet)
      return res.status(400).json({ error: 'Données invalides' });

    // Archiver l'ancien prix actif pour cette catégorie
    await conn.query(
      'UPDATE prix_carton SET actif = 0 WHERE categorie = ? AND actif = 1', [categorie]
    );
    const [result] = await conn.query(
      'INSERT INTO prix_carton (date_effet, categorie, prix_unitaire, actif) VALUES (?, ?, ?, 1)',
      [date_effet, categorie, prix_unitaire]
    );
    await conn.commit();
    const [newPrix] = await db.query('SELECT * FROM prix_carton WHERE id = ?', [result.insertId]);
    res.status(201).json(newPrix[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
