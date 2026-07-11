// routes/recouvrements.js
// Logique avance :
// - Si paiement > solde_global → excédent va dans solde_avance
// - La table stocke avance_creee pour pouvoir annuler proprement
// - Suppression : restaure exactement solde_global ET solde_avance d'avant
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const { date_debut, date_fin, client_id } = req.query;
    let sql = `SELECT r.*, c.nom as client_nom, c.solde_global, c.solde_avance
               FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id WHERE 1=1`;
    const params = [];
    if (date_debut) { sql += ' AND r.date_paiement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND r.date_paiement <= ?'; params.push(date_fin); }
    if (client_id)  { sql += ' AND r.client_id = ?';      params.push(client_id); }
    sql += ' ORDER BY r.date_paiement DESC, r.id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const client_id     = req.body.client_id;
    const montant_recu  = parseFloat(req.body.montant_recu || req.body.montant || 0);
    const date_paiement = req.body.date_paiement;
    const date_suivi    = req.body.date_suivi  || null;
    const observation   = req.body.observation || null;

    if (!client_id || !montant_recu || montant_recu <= 0 || !date_paiement)
      return res.status(400).json({ error: 'Client, montant et date requis' });

    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientRows[0];

    const soldeAvant  = parseFloat(client.solde_global  || 0);
    const avanceAvant = parseFloat(client.solde_avance  || 0);

    // ── Calcul du nouveau solde et de l'avance créée ──
    let nouveauSolde = 0;
    let avanceCreee  = 0;

    if (montant_recu >= soldeAvant) {
      nouveauSolde = 0;
      avanceCreee  = montant_recu - soldeAvant;
    } else {
      nouveauSolde = soldeAvant - montant_recu;
      avanceCreee  = 0;
    }

    const nouvelleAvance  = avanceAvant + avanceCreee;
    const montant_restant = nouveauSolde;

    const [result] = await conn.query(
      `INSERT INTO recouvrements
       (client_id, date_paiement, montant_recu, montant_restant, avance_creee, date_suivi, observation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [client_id, date_paiement, montant_recu, montant_restant, avanceCreee, date_suivi, observation]
    );

    await conn.query(
      'UPDATE clients SET solde_global = ?, solde_avance = ? WHERE id = ?',
      [nouveauSolde, nouvelleAvance, client_id]
    );

    await conn.commit();

    const msg = avanceCreee > 0
      ? `Paiement ${montant_recu} FCFA de ${client.nom} — Solde soldé + avance : ${avanceCreee} FCFA`
      : `Paiement ${montant_recu} FCFA de ${client.nom} — Reste dû : ${nouveauSolde} FCFA`;
    await logAction(req.user, 'CREATE', 'recouvrements', msg);

    const [newRec] = await db.query(
      `SELECT r.*, c.nom as client_nom FROM recouvrements r
       LEFT JOIN clients c ON r.client_id = c.id WHERE r.id = ?`, [result.insertId]
    );
    res.status(201).json({ ...newRec[0], avance_creee: avanceCreee });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  } finally { conn.release(); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM recouvrements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const old = rows[0];

    const montant_recu  = parseFloat(req.body.montant_recu || req.body.montant || 0);
    const date_paiement = req.body.date_paiement;
    const observation   = req.body.observation || null;

    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [old.client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientRows[0];

    // Annuler l'effet de l'ancien recouvrement
    const ancienneAvanceCreee = parseFloat(old.avance_creee || 0);
    const ancienMontantImpute = parseFloat(old.montant_recu) - ancienneAvanceCreee;
    const soldeOriginal  = parseFloat(client.solde_global) + ancienMontantImpute;
    const avanceOriginale = Math.max(0, parseFloat(client.solde_avance) - ancienneAvanceCreee);

    // Recalculer avec nouveau montant
    let nouveauSolde = 0, nouvelleAvanceCreee = 0;
    if (montant_recu >= soldeOriginal) {
      nouveauSolde       = 0;
      nouvelleAvanceCreee = montant_recu - soldeOriginal;
    } else {
      nouveauSolde       = soldeOriginal - montant_recu;
      nouvelleAvanceCreee = 0;
    }

    await conn.query(
      'UPDATE recouvrements SET date_paiement=?, montant_recu=?, montant_restant=?, avance_creee=?, observation=? WHERE id=?',
      [date_paiement, montant_recu, nouveauSolde, nouvelleAvanceCreee, observation, req.params.id]
    );
    await conn.query(
      'UPDATE clients SET solde_global = ?, solde_avance = ? WHERE id = ?',
      [nouveauSolde, avanceOriginale + nouvelleAvanceCreee, old.client_id]
    );

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'recouvrements', `Recouvrement #${req.params.id} modifié`);
    const [updated] = await db.query(
      `SELECT r.*, c.nom as client_nom FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id WHERE r.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM recouvrements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const r = rows[0];

    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [r.client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientRows[0];

    const avanceCreee   = parseFloat(r.avance_creee || 0);
    const montantImpute = parseFloat(r.montant_recu) - avanceCreee;

    // Restaurer exactement l'état avant ce recouvrement
    const nouveauSolde   = parseFloat(client.solde_global) + montantImpute;
    const nouvelleAvance = Math.max(0, parseFloat(client.solde_avance) - avanceCreee);

    await conn.query(
      'UPDATE clients SET solde_global = ?, solde_avance = ? WHERE id = ?',
      [nouveauSolde, nouvelleAvance, r.client_id]
    );
    await conn.query('DELETE FROM recouvrements WHERE id = ?', [req.params.id]);
    await conn.commit();

    await logAction(req.user, 'DELETE', 'recouvrements',
      `Recouvrement #${req.params.id} supprimé — solde restauré à ${nouveauSolde} FCFA`);
    res.json({ message: 'Recouvrement supprimé, solde restauré exactement' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
