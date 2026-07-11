// routes/categories.js — Catégories de prix personnalisées
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM categories_clients WHERE actif = 1 ORDER BY prix_unitaire'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prix_unitaire, description } = req.body;
    if (!nom || !prix_unitaire) return res.status(400).json({ error: 'Nom et prix requis' });
    const [result] = await db.query(
      'INSERT INTO categories_clients (nom, prix_unitaire, description) VALUES (?, ?, ?)',
      [nom, prix_unitaire, description || null]
    );
    await logAction(req.user, 'CREATE', 'categories', `Catégorie créée : ${nom} — ${prix_unitaire} FCFA`);
    const [newCat] = await db.query('SELECT * FROM categories_clients WHERE id = ?', [result.insertId]);
    res.status(201).json(newCat[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prix_unitaire, description } = req.body;
    if (!nom || !prix_unitaire) return res.status(400).json({ error: 'Nom et prix requis' });
    await db.query(
      'UPDATE categories_clients SET nom=?, prix_unitaire=?, description=? WHERE id=?',
      [nom, prix_unitaire, description || null, req.params.id]
    );
    await logAction(req.user, 'UPDATE', 'categories', `Catégorie #${req.params.id} modifiée`);
    const [updated] = await db.query('SELECT * FROM categories_clients WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const [clients] = await db.query('SELECT COUNT(*) as n FROM clients WHERE categorie_id = ?', [req.params.id]);
    if (clients[0].n > 0)
      return res.status(400).json({ error: `${clients[0].n} client(s) utilisent cette catégorie` });
    await db.query('UPDATE categories_clients SET actif = 0 WHERE id = ?', [req.params.id]);
    await logAction(req.user, 'DELETE', 'categories', `Catégorie #${req.params.id} désactivée`);
    res.json({ message: 'Catégorie désactivée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
