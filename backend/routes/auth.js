// routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const { auth } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.post('/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;
  if (!email || !mot_de_passe)
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  try {
    const [rows] = await db.query(
      'SELECT * FROM utilisateurs WHERE email = ? AND statut = "actif"', [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = rows[0];
    const ok   = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    await db.query('UPDATE utilisateurs SET dernier_acces = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, nom: user.nom, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Log connexion
    try {
      await db.query(
        `INSERT INTO journal_activite (utilisateur_id, utilisateur_nom, action, module, description)
         VALUES (?, ?, 'LOGIN', 'auth', ?)`,
        [user.id, user.nom, `Connexion depuis ${req.ip || 'inconnu'}`]
      );
    } catch (e) { /* table peut ne pas exister encore */ }

    res.json({ token, user: { id: user.id, nom: user.nom, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, email, role, statut, dernier_acces FROM utilisateurs WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
