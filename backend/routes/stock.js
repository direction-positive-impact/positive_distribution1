// routes/stock.js
// 1 carton = 12 plateaux = 360 oeufs (CC et CT identiques)
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

const PLATEAUX_PAR_CARTON = 12;
const OEUFS_PAR_PLATEAU   = 30;
const OEUFS_PAR_CARTON    = PLATEAUX_PAR_CARTON * OEUFS_PAR_PLATEAU; // 360

function calcStock(cc, ct, plat, oeufs) {
  const totalCartons  = Number(cc || 0) + Number(ct || 0);
  const totalPlateaux = totalCartons * PLATEAUX_PAR_CARTON + Number(plat || 0);
  const totalOeufs    = totalPlateaux * OEUFS_PAR_PLATEAU + Number(oeufs || 0);
  return { totalCartons, totalPlateaux, totalOeufs };
}

// GET /api/stock
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = rows[0] || { cartons: 0, cartons_cc: 0, cartons_ct: 0, plateaux: 0, oeufs: 0 };
    const { totalPlateaux, totalOeufs } = calcStock(s.cartons_cc, s.cartons_ct, s.plateaux, s.oeufs);
    res.json({ ...s, totalPlateaux, totalOeufs });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/stock/mouvements
router.get('/mouvements', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM stock_mouvements ORDER BY date_mouvement DESC, id DESC'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/stock/ajustement — ajustement manuel CC + CT séparément
router.post('/ajustement', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_mouvement, cartons_cc, cartons_ct, plateaux, oeufs, motif } = req.body;
    const cc  = parseInt(cartons_cc  || 0);
    const ct  = parseInt(cartons_ct  || 0);
    const plat = parseInt(plateaux   || 0);
    const oeuf = parseInt(oeufs      || 0);
    const totalCartons = cc + ct;

    if (!motif) return res.status(400).json({ error: 'Motif requis' });

    await conn.query(
      `UPDATE stock_actuel SET
         cartons    = cartons + ?,
         cartons_cc = cartons_cc + ?,
         cartons_ct = cartons_ct + ?,
         plateaux   = plateaux + ?,
         oeufs      = oeufs + ?
       WHERE id = 1`,
      [totalCartons, cc, ct, plat, oeuf]
    );

    const motifDetail = `${motif}${cc>0?` | +${cc} CC`:``}${ct>0?` | +${ct} CT`:``}`;
    await conn.query(
      `INSERT INTO stock_mouvements
       (date_mouvement, type_mouvement, cartons, cartons_cc, cartons_ct, plateaux, oeufs, motif)
       VALUES (?, 'ajustement', ?, ?, ?, ?, ?, ?)`,
      [date_mouvement || new Date().toISOString().split('T')[0],
       totalCartons, cc, ct, plat, oeuf, motifDetail]
    );

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'stock', motifDetail);
    const [upd] = await db.query('SELECT * FROM stock_actuel WHERE id = 1');
    res.json(upd[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// DELETE /api/stock/mouvements/:id
router.delete('/mouvements/:id', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM stock_mouvements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const m = rows[0];
    // Seulement les ajustements manuels
    if (m.reference_type && m.reference_type !== '') {
      return res.status(400).json({ error: 'Impossible de supprimer un mouvement automatique' });
    }
    const cc  = Number(m.cartons_cc || 0);
    const ct  = Number(m.cartons_ct || 0);
    await db.query(
      `UPDATE stock_actuel SET
         cartons    = GREATEST(0, cartons - ?),
         cartons_cc = GREATEST(0, cartons_cc - ?),
         cartons_ct = GREATEST(0, cartons_ct - ?)
       WHERE id = 1`,
      [Number(m.cartons), cc, ct]
    );
    await db.query('DELETE FROM stock_mouvements WHERE id = ?', [req.params.id]);
    await logAction(req.user, 'DELETE', 'stock', `Mouvement #${req.params.id} supprimé`);
    res.json({ message: 'Mouvement supprimé' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
module.exports.calcStock = calcStock;
