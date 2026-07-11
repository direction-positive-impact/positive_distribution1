// routes/pertes.js — Fix soustraction stock (oeufs cassés ne s'additionnent plus)
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

function normaliser(totalOeufs) {
  const t = Math.max(0, totalOeufs);
  return { cartons: Math.floor(t/360), plateaux: Math.floor((t%360)/30), oeufs: t%30 };
}

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT *, DATE_FORMAT(date_perte, '%Y-%m-%d') as date_perte
       FROM pertes ORDER BY date_perte DESC, id DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const quantite_oeufs = parseInt(req.body.quantite_oeufs || req.body.oeufs || 0);
    const cause      = (req.body.cause || '').trim();
    const type_perte = req.body.type_perte || 'casse';
    const date_perte = req.body.date_perte;

    if (!quantite_oeufs || quantite_oeufs <= 0)
      return res.status(400).json({ error: 'Nombre d\'œufs invalide (doit être > 0)' });
    if (!cause)
      return res.status(400).json({ error: 'Cause obligatoire' });
    if (!date_perte)
      return res.status(400).json({ error: 'Date obligatoire' });

    // ── Vérifier le stock disponible ──
    const [stockRows] = await conn.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = stockRows[0];
    const totalDisponible = s.cartons * 360 + s.plateaux * 30 + s.oeufs;

    if (quantite_oeufs > totalDisponible) {
      await conn.release();
      return res.status(400).json({
        error: `Stock insuffisant. Disponible : ${totalDisponible} œufs (${s.cartons} cartons, ${s.plateaux} plateaux, ${s.oeufs} œufs). Vous essayez de déduire ${quantite_oeufs} œufs.`
      });
    }

    const [result] = await conn.query(
      'INSERT INTO pertes (date_perte, type_perte, quantite_oeufs, cause) VALUES (?, ?, ?, ?)',
      [date_perte, type_perte, quantite_oeufs, cause]
    );

    // ── DÉDUIRE du stock (pas ajouter !) ──
    const nouvelTotal = totalDisponible - quantite_oeufs;
    const { cartons: nc, plateaux: np, oeufs: no } = normaliser(nouvelTotal);
    await conn.query('UPDATE stock_actuel SET cartons=?, plateaux=?, oeufs=? WHERE id=1', [nc, np, no]);

    // Mouvement stock avec équivalents
    const equivC = Math.floor(quantite_oeufs / 360);
    const equivP = Math.floor((quantite_oeufs % 360) / 30);
    const equivO = quantite_oeufs % 30;

    await conn.query(
      `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif, reference_id, reference_type)
       VALUES (?, 'perte', ?, ?, ?, ?, ?, 'perte')`,
      [date_perte, equivC, equivP, equivO,
       `${type_perte} — ${cause} (${quantite_oeufs} œufs)`, result.insertId]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'pertes',
      `Perte : ${quantite_oeufs} œufs — ${type_perte} — ${cause}`);

    const [newPerte] = await db.query(
      `SELECT *, DATE_FORMAT(date_perte,'%Y-%m-%d') as date_perte FROM pertes WHERE id = ?`,
      [result.insertId]
    );
    // Retourner aussi le nouveau stock
    res.status(201).json({ ...newPerte[0], stock: { cartons: nc, plateaux: np, oeufs: no } });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM pertes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const old = rows[0];

    const newOeufs = parseInt(req.body.quantite_oeufs || req.body.oeufs || 0);
    const cause    = (req.body.cause || '').trim();
    const type_perte = req.body.type_perte || old.type_perte;
    const date_perte = req.body.date_perte || old.date_perte;

    if (!newOeufs || newOeufs <= 0 || !cause)
      return res.status(400).json({ error: 'Données invalides' });

    // Différence : ancien était déduit, on doit recalculer
    const diff = newOeufs - parseInt(old.quantite_oeufs); // positif = on déduit plus

    const [stockRows] = await conn.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = stockRows[0];
    let total = s.cartons * 360 + s.plateaux * 30 + s.oeufs - diff;
    if (total < 0) {
      await conn.release();
      return res.status(400).json({ error: 'Modification impossible : stock insuffisant' });
    }
    const { cartons: nc, plateaux: np, oeufs: no } = normaliser(total);

    await conn.query(
      'UPDATE pertes SET date_perte=?, type_perte=?, quantite_oeufs=?, cause=? WHERE id=?',
      [date_perte, type_perte, newOeufs, cause, req.params.id]
    );
    if (diff !== 0) {
      await conn.query('UPDATE stock_actuel SET cartons=?, plateaux=?, oeufs=? WHERE id=1', [nc, np, no]);
    }
    await conn.commit();
    await logAction(req.user, 'UPDATE', 'pertes', `Perte #${req.params.id} modifiée`);
    const [updated] = await db.query(
      `SELECT *, DATE_FORMAT(date_perte,'%Y-%m-%d') as date_perte FROM pertes WHERE id = ?`,
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
    const [rows] = await conn.query('SELECT * FROM pertes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const p = rows[0];

    // Restaurer le stock
    const [stockRows] = await conn.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = stockRows[0];
    const total = s.cartons * 360 + s.plateaux * 30 + s.oeufs + parseInt(p.quantite_oeufs);
    const { cartons: nc, plateaux: np, oeufs: no } = normaliser(total);

    await conn.query('UPDATE stock_actuel SET cartons=?, plateaux=?, oeufs=? WHERE id=1', [nc, np, no]);
    await conn.query('DELETE FROM stock_mouvements WHERE reference_id=? AND reference_type="perte"', [req.params.id]);
    await conn.query('DELETE FROM pertes WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'pertes', `Perte #${req.params.id} supprimée, stock restauré`);
    res.json({ message: 'Perte supprimée, stock restauré' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
