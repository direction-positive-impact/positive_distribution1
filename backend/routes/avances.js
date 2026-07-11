// routes/avances.js — Gestion des avances clients
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

// GET /api/avances — clients avec avance > 0
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.code, c.nom, c.telephone, c.solde_avance,
              cat.nom as categorie_nom
       FROM clients c
       LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
       WHERE c.solde_avance > 0 AND c.statut = 'actif'
       ORDER BY c.solde_avance DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/avances/ajouter — ajouter une avance manuellement
router.post('/ajouter', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { client_id, montant, date_avance, observation } = req.body;
    const mt = parseFloat(montant);
    if (!client_id || !mt || mt <= 0)
      return res.status(400).json({ error: 'Client et montant requis' });

    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientRows[0];

    const nouvelleAvance = Number(client.solde_avance) + mt;
    await conn.query('UPDATE clients SET solde_avance = ? WHERE id = ?', [nouvelleAvance, client_id]);

    // Enregistrer aussi comme recouvrement pour le cash du jour
    await conn.query(
      `INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation)
       VALUES (?, ?, ?, ?, ?)`,
      [client_id, date_avance || new Date().toISOString().split('T')[0],
       mt, Number(client.solde_global),
       observation || `Avance enregistrée — crédit disponible : ${nouvelleAvance.toLocaleString('fr')} FCFA`]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'avances',
      `Avance de ${mt} FCFA pour ${client.nom} — total crédit : ${nouvelleAvance} FCFA`);

    res.json({
      message: 'Avance enregistrée',
      client: client.nom,
      avance_ajoutee: mt,
      total_avance: nouvelleAvance,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// POST /api/avances/ajuster — ajuster manuellement le solde avance (admin)
router.post('/ajuster', auth, adminOnly, async (req, res) => {
  try {
    const { client_id, nouveau_solde, observation } = req.body;
    if (!client_id || nouveau_solde === undefined)
      return res.status(400).json({ error: 'Client et nouveau solde requis' });

    const [clientRows] = await db.query('SELECT * FROM clients WHERE id = ?', [client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });

    await db.query('UPDATE clients SET solde_avance = ? WHERE id = ?', [nouveau_solde, client_id]);
    await logAction(req.user, 'UPDATE', 'avances',
      `Avance ${clientRows[0].nom} ajustée à ${nouveau_solde} FCFA — ${observation || ''}`);

    res.json({ message: 'Avance ajustée', nouveau_solde });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
