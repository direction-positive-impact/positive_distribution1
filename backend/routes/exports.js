// routes/exports.js — Export Excel de toutes les données
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const XLSX   = require('xlsx');

// Helper : créer et envoyer un fichier Excel
function envoyerExcel(res, wb, filename) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// ─── GET /api/exports/ventes ──────────────────────────────
router.get('/ventes', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = `SELECT v.date_vente, v.numero, c.nom as client, c.zone,
                      v.quantite, v.prix_unitaire, v.total, v.paiement,
                      v.solde as restant, v.observations
               FROM ventes v LEFT JOIN clients c ON v.client_id = c.id WHERE 1=1`;
    const params = [];
    if (date_debut) { sql += ' AND v.date_vente >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND v.date_vente <= ?'; params.push(date_fin); }
    sql += ' ORDER BY v.date_vente DESC, v.id DESC';
    const [rows] = await db.query(sql, params);

    const data = [
      ['Date', 'N° Vente', 'Client', 'Zone', 'Quantite (crt)', 'Prix unit (FCFA)', 'Total (FCFA)', 'Paiement (FCFA)', 'Restant (FCFA)', 'Observations'],
      ...rows.map(r => [r.date_vente?.toISOString?.().slice(0,10) || r.date_vente, r.numero, r.client, r.zone || '', r.quantite, r.prix_unitaire, r.total, r.paiement, r.restant, r.observations || ''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:12 },{ wch:14 },{ wch:25 },{ wch:12 },{ wch:14 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
    envoyerExcel(res, wb, `ventes_${date_debut||'tout'}_${date_fin||'tout'}.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/recouvrements ──────────────────────
router.get('/recouvrements', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = `SELECT r.date_paiement, c.nom as client, c.zone,
                      r.montant_recu, r.montant_restant, r.avance_creee,
                      r.observation, r.date_suivi
               FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id WHERE 1=1`;
    const params = [];
    if (date_debut) { sql += ' AND r.date_paiement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND r.date_paiement <= ?'; params.push(date_fin); }
    sql += ' ORDER BY r.date_paiement DESC, r.id DESC';
    const [rows] = await db.query(sql, params);

    const data = [
      ['Date', 'Client', 'Zone', 'Montant recu (FCFA)', 'Restant (FCFA)', 'Avance creee (FCFA)', 'Observation', 'Date suivi'],
      ...rows.map(r => [r.date_paiement?.toISOString?.().slice(0,10)||r.date_paiement, r.client, r.zone||'', r.montant_recu, r.montant_restant, r.avance_creee||0, r.observation||'', r.date_suivi?.toISOString?.().slice(0,10)||r.date_suivi||''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:12 },{ wch:25 },{ wch:12 },{ wch:18 },{ wch:16 },{ wch:18 },{ wch:30 },{ wch:12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recouvrements');
    envoyerExcel(res, wb, `recouvrements_${date_debut||'tout'}.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/clients ─────────────────────────────
router.get('/clients', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.code, c.nom, c.telephone, c.zone, c.adresse,
              cat.nom as categorie, cat.prix_unitaire,
              c.solde_global as impaye, c.solde_avance as avance,
              c.statut, c.observation, c.created_at
       FROM clients c
       LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
       ORDER BY c.nom`
    );
    const data = [
      ['Code', 'Nom', 'Telephone', 'Zone', 'Adresse', 'Categorie', 'Prix/crt (FCFA)', 'Impaye (FCFA)', 'Avance (FCFA)', 'Statut', 'Observation', 'Date creation'],
      ...rows.map(r => [r.code, r.nom, r.telephone||'', r.zone||'', r.adresse||'', r.categorie||'', r.prix_unitaire||'', r.impaye, r.avance, r.statut, r.observation||'', r.created_at?.toISOString?.().slice(0,10)||''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:10 },{ wch:28 },{ wch:14 },{ wch:14 },{ wch:20 },{ wch:22 },{ wch:14 },{ wch:16 },{ wch:14 },{ wch:10 },{ wch:30 },{ wch:14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    envoyerExcel(res, wb, 'clients.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/impayes ─────────────────────────────
router.get('/impayes', auth, async (req, res) => {
  try {
    const { date } = req.query; // filtre optionnel par date
    // Impayés = clients avec solde > 0 au moment demandé
    // Si pas de date → état actuel
    const [rows] = await db.query(
      `SELECT c.code, c.nom, c.zone, c.telephone,
              cat.nom as categorie, cat.prix_unitaire,
              c.solde_global as impaye, c.solde_avance as avance
       FROM clients c
       LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
       WHERE c.solde_global > 0
       ORDER BY c.solde_global DESC`
    );
    const total = rows.reduce((s,r) => s+Number(r.impaye), 0);
    const data = [
      [`Impayés au ${date || new Date().toLocaleDateString('fr-FR')}`],
      [],
      ['Code', 'Client', 'Zone', 'Telephone', 'Categorie', 'Impaye (FCFA)', 'Avance (FCFA)'],
      ...rows.map(r => [r.code, r.nom, r.zone||'', r.telephone||'', r.categorie||'', r.impaye, r.avance]),
      [],
      ['', '', '', '', 'TOTAL', total, '']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:10 },{ wch:28 },{ wch:14 },{ wch:14 },{ wch:22 },{ wch:16 },{ wch:14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Impayes');
    envoyerExcel(res, wb, `impayes_${date||'actuel'}.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/avances ─────────────────────────────
router.get('/avances', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.code, c.nom, c.telephone, c.zone,
              cat.nom as categorie, c.solde_avance as avance
       FROM clients c
       LEFT JOIN categories_clients cat ON c.categorie_id = cat.id
       WHERE c.solde_avance > 0 ORDER BY c.solde_avance DESC`
    );
    const data = [
      ['Code', 'Client', 'Telephone', 'Zone', 'Categorie', 'Avance disponible (FCFA)'],
      ...rows.map(r => [r.code, r.nom, r.telephone||'', r.zone||'', r.categorie||'', r.avance])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Avances');
    envoyerExcel(res, wb, 'avances_clients.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/depenses ────────────────────────────
router.get('/depenses', auth, adminOnly, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = 'SELECT * FROM depenses WHERE 1=1';
    const params = [];
    if (date_debut) { sql += ' AND date_depense >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_depense <= ?'; params.push(date_fin); }
    sql += ' ORDER BY date_depense DESC';
    const [rows] = await db.query(sql, params);
    const total = rows.reduce((s,r) => s+Number(r.montant), 0);
    const data = [
      ['Date', 'Type', 'Montant (FCFA)', 'Beneficiaire', 'Description'],
      ...rows.map(r => [r.date_depense?.toISOString?.().slice(0,10)||r.date_depense, r.type_depense, r.montant, r.beneficiaire||'', r.description||'']),
      [], ['', 'TOTAL', total, '', '']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:12 },{ wch:22 },{ wch:16 },{ wch:20 },{ wch:30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Depenses');
    envoyerExcel(res, wb, `depenses_${date_debut||'tout'}.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/stock ───────────────────────────────
router.get('/stock', auth, async (req, res) => {
  try {
    const [actuel]  = await db.query('SELECT * FROM stock_actuel WHERE id = 1');
    const [mouvts]  = await db.query('SELECT * FROM stock_mouvements ORDER BY date_mouvement DESC');
    const wb = XLSX.utils.book_new();

    const s = actuel[0] || {};
    const plateaux = (s.cartons||0)*12 + (s.plateaux||0);
    const oeufs    = (s.cartons||0)*360 + (s.plateaux||0)*30 + (s.oeufs||0);
    const wsActuel = XLSX.utils.aoa_to_sheet([
      ['Stock actuel'],
      ['Cartons total', s.cartons||0],
      ['  dont CC (Cameroun)', s.cartons_cc||0],
      ['  dont CT (Tchad)',    s.cartons_ct||0],
      ['Plateaux equivalents', plateaux],
      ['Oeufs equivalents',   oeufs],
    ]);
    XLSX.utils.book_append_sheet(wb, wsActuel, 'Stock actuel');

    const wsMouvts = XLSX.utils.aoa_to_sheet([
      ['Date', 'Type', 'Cartons', 'CC', 'CT', 'Plateaux', 'Oeufs', 'Motif'],
      ...mouvts.map(m => [m.date_mouvement?.toISOString?.().slice(0,10)||m.date_mouvement, m.type_mouvement, m.cartons, m.cartons_cc||0, m.cartons_ct||0, m.plateaux, m.oeufs, m.motif])
    ]);
    wsMouvts['!cols'] = [{ wch:12 },{ wch:12 },{ wch:10 },{ wch:8 },{ wch:8 },{ wch:10 },{ wch:10 },{ wch:40 }];
    XLSX.utils.book_append_sheet(wb, wsMouvts, 'Mouvements stock');
    envoyerExcel(res, wb, 'stock.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/pertes ──────────────────────────────
router.get('/pertes', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM pertes ORDER BY date_perte DESC');
    const data = [
      ['Date', 'Type', 'Quantite oeufs', 'Cause'],
      ...rows.map(r => [r.date_perte?.toISOString?.().slice(0,10)||r.date_perte, r.type_perte, r.quantite_oeufs, r.cause])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pertes');
    envoyerExcel(res, wb, 'pertes.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/banque ──────────────────────────────
router.get('/banque', auth, adminOnly, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = 'SELECT * FROM banque_mouvements WHERE 1=1';
    const params = [];
    if (date_debut) { sql += ' AND date_mouvement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND date_mouvement <= ?'; params.push(date_fin); }
    sql += ' ORDER BY date_mouvement DESC, id DESC';
    const [rows] = await db.query(sql, params);
    const data = [
      ['Date', 'Description', 'Reference', 'Encaissement (FCFA)', 'Decaissement (FCFA)', 'Solde (FCFA)', 'Categorie', 'Commentaires'],
      ...rows.map(r => [r.date_mouvement?.toISOString?.().slice(0,10)||r.date_mouvement, r.description, r.reference||'', r.encaissement, r.decaissement, r.solde, r.categorie||'', r.commentaires||''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:12 },{ wch:30 },{ wch:14 },{ wch:18 },{ wch:18 },{ wch:16 },{ wch:12 },{ wch:30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Banque');
    envoyerExcel(res, wb, `mouvements_banque.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/factures ────────────────────────────
router.get('/factures', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ff.numero, f.nom as fournisseur, ff.date_facture,
              ff.quantite, ff.prix_unitaire, ff.total,
              ff.paiement, ff.solde, ff.observations
       FROM factures_fournisseur ff
       LEFT JOIN fournisseurs f ON ff.fournisseur_id = f.id
       ORDER BY ff.date_facture DESC`
    );
    const data = [
      ['N° Facture', 'Fournisseur', 'Date', 'Quantite', 'Prix unit (FCFA)', 'Total (FCFA)', 'Paye (FCFA)', 'Restant (FCFA)', 'Observations'],
      ...rows.map(r => [r.numero, r.fournisseur, r.date_facture?.toISOString?.().slice(0,10)||r.date_facture, r.quantite, r.prix_unitaire, r.total, r.paiement, r.solde, r.observations||''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:14 },{ wch:25 },{ wch:12 },{ wch:10 },{ wch:16 },{ wch:16 },{ wch:14 },{ wch:14 },{ wch:30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Factures fournisseurs');
    envoyerExcel(res, wb, 'factures_fournisseurs.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/journal ─────────────────────────────
router.get('/journal', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM journal_activite ORDER BY date_action DESC LIMIT 5000'
    );
    const data = [
      ['Date/Heure', 'Utilisateur', 'Action', 'Module', 'Description'],
      ...rows.map(r => [r.date_action?.toISOString?.().replace('T',' ').slice(0,19)||r.date_action, r.utilisateur_nom, r.action, r.module, r.description])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch:20 },{ wch:16 },{ wch:12 },{ wch:14 },{ wch:50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Journal');
    envoyerExcel(res, wb, 'journal_activite.xlsx');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/exports/repartition ────────────────────────
router.get('/repartition', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const dateF = date || new Date().toISOString().slice(0,10);
    const [ventes] = await db.query(
      `SELECT v.date_vente, v.numero, c.nom as client, c.zone,
              v.quantite, v.prix_unitaire, v.total, v.observations
       FROM ventes v LEFT JOIN clients c ON v.client_id = c.id
       WHERE v.date_vente = ? ORDER BY v.id`,
      [dateF]
    );
    const [recs] = await db.query(
      `SELECT r.date_paiement, c.nom as client,
              r.montant_recu, r.montant_restant, r.observation
       FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id
       WHERE r.date_paiement = ? ORDER BY r.id`,
      [dateF]
    );
    const wb = XLSX.utils.book_new();

    const wsV = XLSX.utils.aoa_to_sheet([
      [`Repartition du ${dateF}`], [],
      ['N° Vente', 'Client', 'Zone', 'Quantite (crt)', 'Prix unit (FCFA)', 'Total (FCFA)', 'Observations'],
      ...ventes.map(v => [v.numero, v.client, v.zone||'', v.quantite, v.prix_unitaire, v.total, v.observations||'']),
      [], ['', '', '', ventes.reduce((s,v)=>s+v.quantite,0), '', ventes.reduce((s,v)=>s+Number(v.total),0), 'TOTAL']
    ]);
    XLSX.utils.book_append_sheet(wb, wsV, 'Distributions');

    const wsR = XLSX.utils.aoa_to_sheet([
      [`Encaissements du ${dateF}`], [],
      ['Client', 'Montant recu (FCFA)', 'Restant (FCFA)', 'Observation'],
      ...recs.map(r => [r.client, r.montant_recu, r.montant_restant, r.observation||'']),
      [], ['TOTAL CASH', recs.reduce((s,r)=>s+Number(r.montant_recu),0), '', '']
    ]);
    XLSX.utils.book_append_sheet(wb, wsR, 'Encaissements');

    envoyerExcel(res, wb, `repartition_${dateF}.xlsx`);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
