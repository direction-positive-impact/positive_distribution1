// middleware/auth.js — Vérification JWT
const jwt = require('jsonwebtoken');

// Middleware : vérifie le token JWT dans le header Authorization
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token manquant' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, nom, email, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Middleware : réservé aux admins uniquement
function adminOnly(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = { auth, adminOnly };
