// middleware/journal.js — Enregistrement des actions utilisateurs
const db = require('../config/db');

async function logAction(user, action, module, description) {
  try {
    await db.query(
      `INSERT INTO journal_activite (utilisateur_id, utilisateur_nom, action, module, description)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.nom, action, module, description]
    );
  } catch (e) {
    // Non bloquant — on log juste en console si la table n'existe pas encore
    console.warn('Journal:', e.message);
  }
}

module.exports = { logAction };
