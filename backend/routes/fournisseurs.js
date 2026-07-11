// routes/fournisseurs.js
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

// GET /api/fournisseurs
router.get('/', auth, async (req, res) => {
  try {
    const { statut } = req.query;
    let sql = 'SELECT * FROM fournisseurs WHERE 1=1';
    const params = [];
    if (statut) { sql += ' AND statut = ?'; params.push(statut); }
    sql += ' ORDER BY nom';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/fournisseurs
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { nom, telephone, adresse, observation } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const [result] = await db.query(
      'INSERT INTO fournisseurs (nom, telephone, adresse, statut, observation) VALUES (?, ?, ?, "actif", ?)',
      [nom, telephone || null, adresse || null, observation || null]
    );
    await logAction(req.user, 'CREATE', 'fournisseurs', `Fournisseur créé : ${nom}`);
    const [newF] = await db.query('SELECT * FROM fournisseurs WHERE id = ?', [result.insertId]);
    res.status(201).json(newF[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/fournisseurs/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nom, telephone, adresse, statut, observation } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    await db.query(
      'UPDATE fournisseurs SET nom=?, telephone=?, adresse=?, statut=?, observation=? WHERE id=?',
      [nom, telephone || null, adresse || null, statut || 'actif', observation || null, req.params.id]
    );
    await logAction(req.user, 'UPDATE', 'fournisseurs', `Fournisseur #${req.params.id} modifié`);
    const [updated] = await db.query('SELECT * FROM fournisseurs WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/fournisseurs/:id — archive si factures existantes
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const [factures] = await db.query('SELECT COUNT(*) as n FROM factures_fournisseur WHERE fournisseur_id = ?', [req.params.id]);
    if (factures[0].n > 0) {
      await db.query('UPDATE fournisseurs SET statut = "inactif" WHERE id = ?', [req.params.id]);
      return res.json({ message: 'Fournisseur désactivé (factures existantes)' });
    }
    await db.query('DELETE FROM fournisseurs WHERE id = ?', [req.params.id]);
    await logAction(req.user, 'DELETE', 'fournisseurs', `Fournisseur #${req.params.id} supprimé`);
    res.json({ message: 'Fournisseur supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
