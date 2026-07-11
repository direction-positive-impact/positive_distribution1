// routes/utilisateurs.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, email, role, statut, dernier_acces FROM utilisateurs ORDER BY nom'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { nom, email, mot_de_passe, role } = req.body;
    if (!nom || !email || !mot_de_passe || !role)
      return res.status(400).json({ error: 'Tous les champs sont requis' });

    const [existing] = await db.query('SELECT id FROM utilisateurs WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const [result] = await db.query(
      'INSERT INTO utilisateurs (nom, email, mot_de_passe, role, statut) VALUES (?, ?, ?, ?, "actif")',
      [nom, email, hash, role]
    );
    res.status(201).json({ id: result.insertId, nom, email, role, statut: 'actif' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nom, email, role, statut, mot_de_passe } = req.body;

    // Impossible de modifier son propre statut
    if (parseInt(req.params.id) === req.user.id && statut === 'inactif')
      return res.status(400).json({ error: 'Impossible de désactiver son propre compte' });

    let sql = 'UPDATE utilisateurs SET nom=?, email=?, role=?, statut=?';
    const params = [nom, email, role, statut];

    if (mot_de_passe && mot_de_passe.trim()) {
      const hash = await bcrypt.hash(mot_de_passe, 10);
      sql += ', mot_de_passe=?';
      params.push(hash);
    }
    sql += ' WHERE id=?';
    params.push(req.params.id);

    await db.query(sql, params);
    res.json({ message: 'Utilisateur mis à jour' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
