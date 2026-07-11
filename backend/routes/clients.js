// routes/clients.js — avec catégorie_id et solde_avance
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const { search, categorie, categorie_id, statut } = req.query;
    let sql = `SELECT c.*, cat.nom as categorie_nom, cat.prix_unitaire as prix_categorie
               FROM clients c
               LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
               WHERE 1=1`;
    const params = [];
    if (search)       { sql += ' AND (c.nom LIKE ? OR c.code LIKE ?)'; params.push('%'+search+'%','%'+search+'%'); }
    if (categorie)    { sql += ' AND c.categorie = ?';    params.push(categorie); }
    if (categorie_id) { sql += ' AND c.categorie_id = ?'; params.push(categorie_id); }
    if (statut)       { sql += ' AND c.statut = ?';       params.push(statut); }
    sql += ' ORDER BY c.nom';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, categorie_id, statut, observation } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });

    const [lastClient] = await db.query('SELECT MAX(id) as max_id FROM clients');
    const nextId = (lastClient[0].max_id || 0) + 1;
    const code   = 'CLI-' + String(nextId).padStart(3, '0');

    const VALID_CAT = ['revendeur_principal','revendeur_strategique','autre_revendeur','patisserie_conso'];
    const categorieVal = VALID_CAT.includes(categorie) ? categorie : 'autre_revendeur';

    const [result] = await db.query(
      `INSERT INTO clients (code, nom, telephone, zone, adresse, categorie, categorie_id, statut, observation, solde_global, solde_avance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [code, nom, telephone||null, zone||null, adresse||null,
       categorieVal, categorie_id||null,
       statut||'actif', observation||null]
    );
    await logAction(req.user, 'CREATE', 'clients', `Client créé : ${nom}`);
    const [newClient] = await db.query(
      `SELECT c.*, cat.nom as categorie_nom, cat.prix_unitaire as prix_categorie
       FROM clients c LEFT JOIN categories_clients cat ON c.categorie_id = cat.id WHERE c.id = ?`,
      [result.insertId]
    );
    res.status(201).json(newClient[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, categorie_id, statut, observation } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const VALID_CAT = ['revendeur_principal','revendeur_strategique','autre_revendeur','patisserie_conso'];
    const categorieVal = VALID_CAT.includes(categorie) ? categorie : 'autre_revendeur';
    await db.query(
      `UPDATE clients SET nom=?, telephone=?, zone=?, adresse=?, categorie=?, categorie_id=?, statut=?, observation=? WHERE id=?`,
      [nom, telephone||null, zone||null, adresse||null,
       categorieVal, categorie_id||null,
       statut||'actif', observation||null, req.params.id]
    );
    await logAction(req.user, 'UPDATE', 'clients', `Client #${req.params.id} modifié`);
    const [updated] = await db.query(
      `SELECT c.*, cat.nom as categorie_nom, cat.prix_unitaire as prix_categorie
       FROM clients c LEFT JOIN categories_clients cat ON c.categorie_id = cat.id WHERE c.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('UPDATE clients SET statut = "inactif" WHERE id = ?', [req.params.id]);
    await logAction(req.user, 'DELETE', 'clients', `Client #${req.params.id} archivé`);
    res.json({ message: 'Client archivé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
