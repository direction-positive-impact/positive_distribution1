// routes/journal.js — Journal des activités
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/journal — admin uniquement
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { module, utilisateur_id, date_debut, date_fin, limit: lim } = req.query;
    let sql = 'SELECT * FROM journal_activite WHERE 1=1';
    const params = [];
    if (module)         { sql += ' AND module = ?';              params.push(module); }
    if (utilisateur_id) { sql += ' AND utilisateur_id = ?';      params.push(utilisateur_id); }
    if (date_debut)     { sql += ' AND DATE(date_action) >= ?';  params.push(date_debut); }
    if (date_fin)       { sql += ' AND DATE(date_action) <= ?';  params.push(date_fin); }
    sql += ' ORDER BY date_action DESC';
    sql += ' LIMIT ' + (parseInt(lim) || 200);
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/journal/stats — résumé par utilisateur
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT utilisateur_nom, module, action, COUNT(*) as nb,
             MAX(date_action) as derniere_action
      FROM journal_activite
      GROUP BY utilisateur_nom, module, action
      ORDER BY utilisateur_nom, module
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
