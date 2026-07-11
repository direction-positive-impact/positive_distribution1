// routes/banque.js — Versement journalier, frais bancaires, solde initial, paiements fournisseurs
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logAction } = require('../middleware/journal');

// GET /api/banque
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { date_debut, date_fin, categorie } = req.query;
    let sql = 'SELECT * FROM banque_mouvements WHERE 1=1';
    const params = [];
    if (date_debut) { sql += ' AND date_mouvement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_mouvement <= ?'; params.push(date_fin); }
    if (categorie)  { sql += ' AND categorie = ?'; params.push(categorie); }
    sql += ' ORDER BY date_mouvement DESC, id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/banque/solde — solde actuel (utilisé partout)
router.get('/solde', auth, adminOnly, async (req, res) => {
  try {
    const [lastRow] = await db.query('SELECT solde FROM banque_mouvements ORDER BY id DESC LIMIT 1');
    if (lastRow.length) {
      return res.json({ solde: parseFloat(lastRow[0].solde) });
    }
    // Aucun mouvement : retourner le solde initial configuré
    const [si] = await db.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
    const solde = si.length ? parseFloat(si[0].valeur) : 0;
    res.json({ solde });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/banque/resume-jour/:date — total recouvrements du jour à verser
router.get('/resume-jour/:date', auth, adminOnly, async (req, res) => {
  try {
    const date = req.params.date;
    const [recouvrements] = await db.query(
      `SELECT r.montant_recu, c.nom as client_nom
       FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id
       WHERE r.date_paiement = ? ORDER BY r.id`,
      [date]
    );
    const total = recouvrements.reduce((s, r) => s + Number(r.montant_recu), 0);
    res.json({ date, recouvrements, total });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/banque/solde-initial — récupérer le solde initial configuré
router.get('/solde-initial', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM parametres WHERE cle LIKE "solde_banque_initial%"');
    const params = {};
    rows.forEach(r => { params[r.cle] = r.valeur; });
    res.json({
      montant: parseFloat(params.solde_banque_initial || 0),
      date: params.solde_banque_initial_date || null,
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/banque/solde-initial — définir/modifier le solde initial (une seule fois normalement)
router.post('/solde-initial', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { montant, date } = req.body;
    const mt = parseFloat(montant);
    if (isNaN(mt)) return res.status(400).json({ error: 'Montant invalide' });

    await conn.query(
      'INSERT INTO parametres (cle, valeur) VALUES ("solde_banque_initial", ?) ON DUPLICATE KEY UPDATE valeur = ?',
      [mt, mt]
    );
    await conn.query(
      'INSERT INTO parametres (cle, valeur) VALUES ("solde_banque_initial_date", ?) ON DUPLICATE KEY UPDATE valeur = ?',
      [date, date]
    );

    // Recalculer tous les soldes des mouvements existants à partir du nouveau solde initial
    const [mvts] = await conn.query('SELECT * FROM banque_mouvements ORDER BY date_mouvement ASC, id ASC');
    let soldeRunning = mt;
    for (const m of mvts) {
      soldeRunning += Number(m.encaissement) - Number(m.decaissement);
      await conn.query('UPDATE banque_mouvements SET solde = ? WHERE id = ?', [soldeRunning, m.id]);
    }

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'banque', `Solde initial banque défini à ${mt} FCFA au ${date}`);
    res.json({ message: 'Solde initial enregistré', montant: mt, solde_actuel: soldeRunning });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// POST /api/banque — créer un mouvement (catégorie: recouvrement, frais_bancaire, paiement_fournisseur, autre)
router.post('/', auth, adminOnly, upload.single('fichier'), async (req, res) => {
  try {
    const { date_mouvement, description, reference, encaissement, decaissement, commentaires, categorie } = req.body;
    if (!description) return res.status(400).json({ error: 'Description requise' });

    const enc = parseFloat(encaissement) || 0;
    const dec = parseFloat(decaissement) || 0;
    if (enc === 0 && dec === 0) return res.status(400).json({ error: 'Montant requis' });

    const fichier = req.file ? req.file.filename : null;

    const [lastRow] = await db.query('SELECT solde FROM banque_mouvements ORDER BY id DESC LIMIT 1');
    let soldePrev = lastRow.length ? parseFloat(lastRow[0].solde) : null;

    // Si aucun mouvement n'existe encore, partir du solde initial configuré
    if (soldePrev === null) {
      const [si] = await db.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
      soldePrev = si.length ? parseFloat(si[0].valeur) : 0;
    }

    const solde = soldePrev + enc - dec;

    const [result] = await db.query(
      `INSERT INTO banque_mouvements (date_mouvement, description, reference, encaissement, decaissement, solde, commentaires, fichier_bordereau, categorie)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date_mouvement, description, reference || null, enc, dec, solde, commentaires || null, fichier, categorie || 'autre']
    );

    await logAction(req.user, 'CREATE', 'banque',
      `${enc > 0 ? 'Versement' : 'Décaissement'} ${enc > 0 ? enc : dec} FCFA — ${description}`);

    const [newRow] = await db.query('SELECT * FROM banque_mouvements WHERE id = ?', [result.insertId]);
    res.status(201).json(newRow[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', auth, adminOnly, upload.single('fichier'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM banque_mouvements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const old = rows[0];
    const { date_mouvement, description, reference, encaissement, decaissement, commentaires, categorie } = req.body;
    const enc = parseFloat(encaissement) || 0;
    const dec = parseFloat(decaissement) || 0;
    const fichier = req.file ? req.file.filename : old.fichier_bordereau;

    await conn.query(
      `UPDATE banque_mouvements SET date_mouvement=?, description=?, reference=?, encaissement=?, decaissement=?, commentaires=?, fichier_bordereau=?, categorie=? WHERE id=?`,
      [date_mouvement, description, reference || null, enc, dec, commentaires || null, fichier, categorie || old.categorie, req.params.id]
    );

    // Recalculer tous les soldes après cette modification (en cascade)
    const [si] = await conn.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
    let soldeRunning = si.length ? parseFloat(si[0].valeur) : 0;
    const [mvts] = await conn.query('SELECT * FROM banque_mouvements ORDER BY date_mouvement ASC, id ASC');
    for (const m of mvts) {
      soldeRunning += Number(m.encaissement) - Number(m.decaissement);
      await conn.query('UPDATE banque_mouvements SET solde = ? WHERE id = ?', [soldeRunning, m.id]);
    }

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'banque', `Mouvement #${req.params.id} modifié`);
    const [updated] = await db.query('SELECT * FROM banque_mouvements WHERE id = ?', [req.params.id]);
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
    await conn.query('DELETE FROM banque_mouvements WHERE id = ?', [req.params.id]);

    // Recalculer la cascade des soldes
    const [si] = await conn.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
    let soldeRunning = si.length ? parseFloat(si[0].valeur) : 0;
    const [mvts] = await conn.query('SELECT * FROM banque_mouvements ORDER BY date_mouvement ASC, id ASC');
    for (const m of mvts) {
      soldeRunning += Number(m.encaissement) - Number(m.decaissement);
      await conn.query('UPDATE banque_mouvements SET solde = ? WHERE id = ?', [soldeRunning, m.id]);
    }

    await conn.commit();
    await logAction(req.user, 'DELETE', 'banque', `Mouvement #${req.params.id} supprimé`);
    res.json({ message: 'Supprimé' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
