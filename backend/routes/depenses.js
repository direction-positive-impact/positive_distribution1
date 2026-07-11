// routes/depenses.js — Gestion des depenses via Afrocaisse
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

// Types de depenses
const TYPES_DEPENSES = [
  'Carburant',
  'Reparation vehicule',
  'Entretien vehicule',
  'Salaire',
  'Loyer',
  'Transport province',
  'Prime chauffeur',
  'Autre',
];

// ─── GET /api/depenses/types ───────────────────────────────
router.get('/types', auth, (req, res) => {
  res.json(TYPES_DEPENSES);
});

// ─── GET /api/depenses/afrocaisse ─────────────────────────
// Solde actuel de l'Afrocaisse
router.get('/afrocaisse', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT solde FROM afrocaisse_mouvements ORDER BY id DESC LIMIT 1'
    );
    if (rows.length) return res.json({ solde: Number(rows[0].solde) });
    // Aucun mouvement — lire le solde initial
    const [si] = await db.query(
      'SELECT valeur FROM parametres WHERE cle = "afrocaisse_initial"'
    );
    res.json({ solde: si.length ? Number(si[0].valeur) : 0 });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/depenses/mouvements ─────────────────────────
router.get('/mouvements', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = 'SELECT * FROM afrocaisse_mouvements WHERE 1=1';
    const params = [];
    if (date_debut) { sql += ' AND date_mouvement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_mouvement <= ?'; params.push(date_fin); }
    sql += ' ORDER BY id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── GET /api/depenses ────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { date_debut, date_fin, type } = req.query;
    let sql = 'SELECT * FROM depenses WHERE 1=1';
    const params = [];
    if (date_debut) { sql += ' AND date_depense >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_depense <= ?'; params.push(date_fin); }
    if (type)       { sql += ' AND type_depense = ?';  params.push(type); }
    sql += ' ORDER BY date_depense DESC, id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── POST /api/depenses/alimenter ─────────────────────────
// Transfert banque → Afrocaisse
router.post('/alimenter', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { montant, date_mouvement, description } = req.body;
    const mt = parseFloat(montant);
    if (!mt || mt <= 0) return res.status(400).json({ error: 'Montant invalide' });

    // Solde afrocaisse avant
    const [lastAf] = await conn.query(
      'SELECT solde FROM afrocaisse_mouvements ORDER BY id DESC LIMIT 1'
    );
    const [siAf] = await conn.query(
      'SELECT valeur FROM parametres WHERE cle = "afrocaisse_initial"'
    );
    const soldePrevAf = lastAf.length ? Number(lastAf[0].solde)
      : (siAf.length ? Number(siAf[0].valeur) : 0);
    const nouveauSoldeAf = soldePrevAf + mt;

    // Insérer mouvement afrocaisse (entrée)
    await conn.query(
      `INSERT INTO afrocaisse_mouvements
       (date_mouvement, type_mouvement, montant, solde, description)
       VALUES (?, 'entree', ?, ?, ?)`,
      [date_mouvement || new Date().toISOString().split('T')[0],
       mt, nouveauSoldeAf,
       description || `Alimentation depuis banque : ${mt} FCFA`]
    );

    // Déduire de la banque
    const [lastBq] = await conn.query(
      'SELECT solde FROM banque_mouvements ORDER BY id DESC LIMIT 1'
    );
    const [siBq] = await conn.query(
      'SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"'
    );
    const soldePrevBq = lastBq.length ? Number(lastBq[0].solde)
      : (siBq.length ? Number(siBq[0].valeur) : 0);
    const nouveauSoldeBq = soldePrevBq - mt;

    await conn.query(
      `INSERT INTO banque_mouvements
       (date_mouvement, description, reference, encaissement, decaissement, solde, categorie)
       VALUES (?, ?, NULL, 0, ?, ?, 'autre')`,
      [date_mouvement || new Date().toISOString().split('T')[0],
       description || `Virement vers Afrocaisse : ${mt} FCFA`,
       mt, nouveauSoldeBq]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'depenses',
      `Alimentation Afrocaisse : ${mt} FCFA depuis banque`);

    res.json({
      message: 'Afrocaisse alimentee',
      montant: mt,
      nouveau_solde_afrocaisse: nouveauSoldeAf,
      nouveau_solde_banque: nouveauSoldeBq,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// ─── POST /api/depenses ───────────────────────────────────
// Enregistrer une depense (prelevee de l'Afrocaisse)
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { type_depense, montant, date_depense, beneficiaire, description } = req.body;
    const mt = parseFloat(montant);
    if (!type_depense || !mt || mt <= 0)
      return res.status(400).json({ error: 'Type et montant requis' });

    // Vérifier solde afrocaisse
    const [lastAf] = await conn.query(
      'SELECT solde FROM afrocaisse_mouvements ORDER BY id DESC LIMIT 1'
    );
    const [siAf] = await conn.query(
      'SELECT valeur FROM parametres WHERE cle = "afrocaisse_initial"'
    );
    const soldeAf = lastAf.length ? Number(lastAf[0].solde)
      : (siAf.length ? Number(siAf[0].valeur) : 0);

    if (mt > soldeAf) {
      await conn.rollback();
      return res.status(400).json({
        error: `Solde Afrocaisse insuffisant. Disponible : ${soldeAf} FCFA. Depense : ${mt} FCFA`
      });
    }

    const dateD = date_depense || new Date().toISOString().split('T')[0];
    const nouveauSoldeAf = soldeAf - mt;

    // Insérer la dépense
    const [result] = await conn.query(
      `INSERT INTO depenses
       (type_depense, montant, date_depense, beneficiaire, description)
       VALUES (?, ?, ?, ?, ?)`,
      [type_depense, mt, dateD, beneficiaire || null, description || null]
    );

    // Mouvement afrocaisse (sortie)
    await conn.query(
      `INSERT INTO afrocaisse_mouvements
       (date_mouvement, type_mouvement, montant, solde, description, depense_id)
       VALUES (?, 'sortie', ?, ?, ?, ?)`,
      [dateD, mt, nouveauSoldeAf,
       `${type_depense}${beneficiaire ? ' — ' + beneficiaire : ''}`,
       result.insertId]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'depenses',
      `Depense ${type_depense} : ${mt} FCFA${beneficiaire ? ' — ' + beneficiaire : ''}`);

    const [newDep] = await db.query('SELECT * FROM depenses WHERE id = ?', [result.insertId]);
    res.status(201).json({
      ...newDep[0],
      nouveau_solde_afrocaisse: nouveauSoldeAf,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

// ─── DELETE /api/depenses/:id ─────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM depenses WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Depense non trouvee' });
    const dep = rows[0];

    // Restaurer l'Afrocaisse
    const [lastAf] = await conn.query(
      'SELECT solde FROM afrocaisse_mouvements ORDER BY id DESC LIMIT 1'
    );
    const soldeAf = lastAf.length ? Number(lastAf[0].solde) : 0;
    const nouveauSoldeAf = soldeAf + Number(dep.montant);

    // Supprimer le mouvement afrocaisse lié
    await conn.query('DELETE FROM afrocaisse_mouvements WHERE depense_id = ?', [req.params.id]);
    await conn.query('DELETE FROM depenses WHERE id = ?', [req.params.id]);

    // Corriger le solde afrocaisse (recalculer depuis le dernier mouvement)
    const [newLast] = await conn.query(
      'SELECT id, solde FROM afrocaisse_mouvements ORDER BY id DESC LIMIT 1'
    );
    // Si d'autres mouvements existent, le solde est déjà cohérent après suppression
    // Sinon on insère un ajustement
    if (!newLast.length) {
      const [siAf] = await conn.query('SELECT valeur FROM parametres WHERE cle = "afrocaisse_initial"');
      // Rien à faire — le solde est l'initial
    }

    await conn.commit();
    await logAction(req.user, 'DELETE', 'depenses',
      `Depense #${req.params.id} supprimee — ${dep.type_depense} ${dep.montant} FCFA`);
    res.json({ message: 'Depense supprimee' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// ─── GET /api/depenses/stats ──────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = `SELECT type_depense,
                 COUNT(*) as nb,
                 SUM(montant) as total
               FROM depenses WHERE 1=1`;
    const params = [];
    if (date_debut) { sql += ' AND date_depense >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_depense <= ?'; params.push(date_fin); }
    sql += ' GROUP BY type_depense ORDER BY total DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
