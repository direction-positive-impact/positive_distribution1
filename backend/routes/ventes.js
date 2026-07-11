// routes/ventes.js — avec déduction automatique avance client
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const { date, client_id, statut, date_debut, date_fin } = req.query;
    let sql = `SELECT v.*, c.nom as client_nom, c.zone as client_zone,
                      c.categorie as client_cat, c.solde_avance,
                      cat.nom as categorie_nom, cat.prix_unitaire as prix_categorie
               FROM ventes v
               LEFT JOIN clients c ON v.client_id = c.id
               LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
               WHERE 1=1`;
    const params = [];
    if (date)       { sql += ' AND v.date_vente = ?';  params.push(date); }
    if (date_debut) { sql += ' AND v.date_vente >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND v.date_vente <= ?'; params.push(date_fin); }
    if (client_id)  { sql += ' AND v.client_id = ?';   params.push(client_id); }
    if (statut === 'solde')   sql += ' AND v.solde <= 0';
    if (statut === 'impaye')  sql += ' AND v.solde > 0';
    sql += ' ORDER BY v.date_vente DESC, v.id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_vente, client_id, quantite, prix_unitaire, observations, type_carton } = req.body;
    // parseFloat pour accepter les demi-cartons (0.5, 1.5, 2.5...)
    // On arrondit à 0.5 près pour éviter les valeurs aberrantes
    const qte     = Math.round(parseFloat(quantite) * 2) / 2;
    const pu      = parseInt(prix_unitaire);
    const typeCart = type_carton || 'CC';

    if (!client_id || !qte || !pu || qte <= 0 || pu <= 0) {
      conn.release();
      return res.status(400).json({ error: 'Client, quantite et prix requis' });
    }

    // Verifier le stock AVANT tout
    const [stockRows] = await conn.query('SELECT cartons, cartons_cc, cartons_ct FROM stock_actuel WHERE id = 1');
    const stockDispo   = stockRows[0]?.cartons    || 0;
    const stockCC      = stockRows[0]?.cartons_cc || 0;
    const stockCT      = stockRows[0]?.cartons_ct || 0;

    if (qte > stockDispo) {
      conn.release();
      return res.status(400).json({
        error: `Stock insuffisant. Total disponible : ${stockDispo} carton(s) (${stockCC} CC + ${stockCT} CT). Vous demandez : ${qte} carton(s).`
      });
    }
    if (typeCart === 'CC' && qte > stockCC) {
      conn.release();
      return res.status(400).json({
        error: `Stock CC insuffisant. Disponible : ${stockCC} carton(s) CC. Vous demandez : ${qte} CC.`
      });
    }
    if (typeCart === 'CT' && qte > stockCT) {
      conn.release();
      return res.status(400).json({
        error: `Stock CT insuffisant. Disponible : ${stockCT} carton(s) CT. Vous demandez : ${qte} CT.`
      });
    }

    // Calcul total : pour 0.5 carton le prix est la moitié du prix unitaire
    const total = Math.round(qte * pu);

    // ── Récupérer solde avance client ──
    const [clientRows] = await conn.query(
      'SELECT * FROM clients WHERE id = ?', [client_id]
    );
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientRows[0];
    const avanceDisponible = Number(client.solde_avance || 0);

    // ── Déduire automatiquement l'avance ──
    let avanceUtilisee  = 0;
    let nouvelleAvance  = avanceDisponible;
    let soldeVente      = total;

    if (avanceDisponible > 0) {
      avanceUtilisee = Math.min(avanceDisponible, total);
      nouvelleAvance = avanceDisponible - avanceUtilisee;
      soldeVente     = Math.max(0, total - avanceUtilisee);
    }

    const [lastVente] = await conn.query('SELECT MAX(id) as max_id FROM ventes');
    const numero = 'VTE-' + String((lastVente[0].max_id || 0) + 1).padStart(3, '0');

    const [result] = await conn.query(
      `INSERT INTO ventes (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, type_carton, observations)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [date_vente, numero, client_id, qte, pu, total, soldeVente, typeCart,
       observations || (avanceUtilisee > 0 ? `Avance deduite : ${avanceUtilisee.toLocaleString('fr')} FCFA` : null)]
    );

    // Déduire stock en distinguant CC et CT
    const isCC = typeCart === 'CC';
    await conn.query(
      `UPDATE stock_actuel SET
         cartons    = cartons - ?,
         cartons_cc = cartons_cc - ?,
         cartons_ct = cartons_ct - ?
       WHERE id = 1`,
      [qte, isCC ? qte : 0, isCC ? 0 : qte]
    );
    await conn.query(
      `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, cartons_cc, cartons_ct, plateaux, oeufs, motif, reference_id, reference_type)
       VALUES (?, 'sortie', ?, ?, ?, 0, 0, ?, ?, 'vente')`,
      [date_vente, qte, isCC ? qte : 0, isCC ? 0 : qte,
       `Vente ${typeCart} a ${client.nom} — ${qte} cartons`, result.insertId]
    );

    // Mettre à jour solde client + avance
    // L'avance consommée NE crée PAS de recouvrement du jour
    // car cet argent a déjà été versé en banque précédemment
    await conn.query(
      'UPDATE clients SET solde_global = solde_global + ?, solde_avance = ? WHERE id = ?',
      [soldeVente, nouvelleAvance, client_id]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'ventes',
      `Vente ${numero} — ${qte} crt à ${client.nom} — Total: ${total} FCFA` +
      (avanceUtilisee > 0 ? ` — Avance déduite: ${avanceUtilisee} FCFA` : ''));

    const [newVente] = await db.query(
      `SELECT v.*, c.nom as client_nom, c.solde_avance
       FROM ventes v LEFT JOIN clients c ON v.client_id = c.id WHERE v.id = ?`,
      [result.insertId]
    );
    res.status(201).json({
      ...newVente[0],
      avance_utilisee: avanceUtilisee,
      avance_restante: nouvelleAvance,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_vente, client_id, quantite, prix_unitaire, observations } = req.body;
    const qte = parseInt(quantite), pu = parseInt(prix_unitaire);
    const total = qte * pu;

    const [oldRows] = await conn.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'Vente non trouvée' });
    const old = oldRows[0];
    const diff = qte - old.quantite;

    const [stockRows] = await conn.query('SELECT cartons FROM stock_actuel WHERE id = 1');
    if (diff > (stockRows[0]?.cartons || 0))
      return res.status(400).json({ error: 'Stock insuffisant' });

    await conn.query(
      `UPDATE ventes SET date_vente=?, client_id=?, quantite=?, prix_unitaire=?, total=?, solde=?, observations=? WHERE id=?`,
      [date_vente, client_id, qte, pu, total, total, observations||null, req.params.id]
    );

    if (diff !== 0)
      await conn.query('UPDATE stock_actuel SET cartons = cartons - ? WHERE id = 1', [diff]);

    await conn.query(
      'UPDATE clients SET solde_global = solde_global - ? + ? WHERE id = ?',
      [Number(old.total), total, old.client_id]
    );

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'ventes', `Vente #${req.params.id} modifiée`);
    const [updated] = await db.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
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
    const [rows] = await conn.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vente non trouvée' });
    const v = rows[0];

    await conn.query('UPDATE stock_actuel SET cartons = cartons + ? WHERE id = 1', [v.quantite]);
    await conn.query(
      'UPDATE clients SET solde_global = GREATEST(0, solde_global - ?) WHERE id = ?',
      [Number(v.solde), v.client_id]
    );
    await conn.query('DELETE FROM stock_mouvements WHERE reference_id=? AND reference_type="vente"', [req.params.id]);
    await conn.query('DELETE FROM ventes WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'ventes', `Vente #${req.params.id} supprimée`);
    res.json({ message: 'Vente supprimée' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
