// routes/factures.js — Factures fournisseur + compte fournisseur (dette/crédit)
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logAction } = require('../middleware/journal');

// GET /api/factures — liste avec filtres
router.get('/', auth, async (req, res) => {
  try {
    const { fournisseur_id, statut, date_debut, date_fin } = req.query;
    let sql = `SELECT ff.*, f.nom as fournisseur_nom
               FROM factures_fournisseur ff
               LEFT JOIN fournisseurs f ON ff.fournisseur_id = f.id WHERE 1=1`;
    const params = [];
    if (fournisseur_id) { sql += ' AND ff.fournisseur_id = ?'; params.push(fournisseur_id); }
    if (date_debut)     { sql += ' AND ff.date_facture >= ?'; params.push(date_debut); }
    if (date_fin)       { sql += ' AND ff.date_facture <= ?'; params.push(date_fin); }
    if (statut === 'solde')   sql += ' AND ff.solde <= 0';
    if (statut === 'impaye')  sql += ' AND ff.solde > 0 AND ff.paiement = 0';
    if (statut === 'partiel') sql += ' AND ff.solde > 0 AND ff.paiement > 0';
    sql += ' ORDER BY ff.date_facture DESC, ff.id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/factures/impayees — vue rapide des dettes fournisseurs
router.get('/impayees', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ff.*, f.nom as fournisseur_nom, f.telephone as fournisseur_tel
       FROM factures_fournisseur ff
       LEFT JOIN fournisseurs f ON ff.fournisseur_id = f.id
       WHERE ff.solde > 0 ORDER BY ff.solde DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/factures/comptes — vue d'ensemble des comptes fournisseurs (dette/crédit)
router.get('/comptes', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nom, telephone, solde_compte, statut
       FROM fournisseurs ORDER BY solde_compte DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/factures — créer une facture (le crédit existant du fournisseur est consommé automatiquement)
router.post('/', auth, upload.single('fichier'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { fournisseur_id, date_facture, quantite, prix_unitaire, paiement, date_echeance, observations, livraison_id } = req.body;
    const qte = parseInt(quantite);
    const pu  = parseInt(prix_unitaire);
    const payManuel = parseFloat(paiement) || 0;

    if (!fournisseur_id || !qte || !pu || qte <= 0 || pu <= 0)
      return res.status(400).json({ error: 'Fournisseur, quantité et prix requis' });

    const total = qte * pu;
    const fichier = req.file ? req.file.filename : null;

    // ── Consommer automatiquement le crédit existant (solde_compte négatif) ──
    const [fournRows] = await conn.query('SELECT * FROM fournisseurs WHERE id = ?', [fournisseur_id]);
    if (!fournRows.length) { await conn.release(); return res.status(404).json({ error: 'Fournisseur non trouvé' }); }
    const fournisseur = fournRows[0];
    const soldeCompteAvant = parseFloat(fournisseur.solde_compte || 0);

    let creditConsomme = 0;
    if (soldeCompteAvant < 0) {
      // Il y a un crédit disponible (avance déjà payée)
      creditConsomme = Math.min(total, -soldeCompteAvant);
    }

    // Paiement effectif = paiement manuel saisi + crédit automatiquement consommé
    const paiementTotal = payManuel + creditConsomme;
    const solde = Math.max(0, total - paiementTotal);

    const [lastF] = await conn.query('SELECT MAX(id) as max_id FROM factures_fournisseur');
    const nextId  = (lastF[0].max_id || 0) + 1;
    const numero  = 'FACT-' + String(nextId).padStart(4, '0');

    const [result] = await conn.query(
      `INSERT INTO factures_fournisseur
       (numero, fournisseur_id, date_facture, quantite, prix_unitaire, total, paiement, solde, date_echeance, observations, fichier_facture, livraison_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, fournisseur_id, date_facture, qte, pu, total, paiementTotal, solde,
       date_echeance || null, observations || null, fichier, livraison_id || null]
    );

    // Si du crédit a été consommé, l'enregistrer comme "paiement" automatique pour traçabilité
    if (creditConsomme > 0) {
      await conn.query(
        `INSERT INTO paiements_fournisseur (facture_id, date_paiement, montant, mode, observation)
         VALUES (?, ?, ?, 'credit_avance', ?)`,
        [result.insertId, date_facture, creditConsomme, `Consommation automatique du crédit d'avance (solde compte avant: ${soldeCompteAvant})`]
      );
    }

    // Mettre à jour le solde du compte fournisseur :
    // Le crédit existant absorbe une partie (ou tout) le total de la facture.
    // Ce qui reste après absorption du crédit + paiement manuel devient la nouvelle dette/crédit.
    // nouveauSoldeCompte = soldeCompteAvant (qui contenait déjà le crédit, donc négatif)
    //                      + total (la nouvelle facture augmente la dette)
    //                      - payManuel (paiement réellement versé en plus, hors crédit)
    // Le crédit consommé n'est PAS à soustraire séparément : il est déjà "dans" soldeCompteAvant
    // et son utilisation se traduit par le fait que solde_compte remonte vers 0 grâce au +total.
    const nouveauSoldeCompte = soldeCompteAvant + total - payManuel;
    await conn.query('UPDATE fournisseurs SET solde_compte = ? WHERE id = ?', [nouveauSoldeCompte, fournisseur_id]);

    await conn.commit();
    await logAction(req.user, 'CREATE', 'factures',
      `Facture ${numero} — ${fournisseur.nom} — ${qte} cartons — Total: ${total} FCFA` +
      (creditConsomme > 0 ? ` — Crédit consommé: ${creditConsomme} FCFA` : ''));

    const [newFact] = await db.query(
      `SELECT ff.*, f.nom as fournisseur_nom FROM factures_fournisseur ff
       LEFT JOIN fournisseurs f ON ff.fournisseur_id = f.id WHERE ff.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ...newFact[0], credit_consomme: creditConsomme, nouveau_solde_compte: nouveauSoldeCompte });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

// PUT /api/factures/:id
router.put('/:id', auth, upload.single('fichier'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM factures_fournisseur WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Facture non trouvée' });
    const old = rows[0];

    const { fournisseur_id, date_facture, quantite, prix_unitaire, paiement, date_echeance, observations } = req.body;
    const qte = parseInt(quantite);
    const pu  = parseInt(prix_unitaire);
    const pay = parseFloat(paiement) || 0;
    const total = qte * pu;
    const solde = Math.max(0, total - pay);
    const fichier = req.file ? req.file.filename : old.fichier_facture;

    await db.query(
      `UPDATE factures_fournisseur SET fournisseur_id=?, date_facture=?, quantite=?, prix_unitaire=?, total=?, paiement=?, solde=?, date_echeance=?, observations=?, fichier_facture=?
       WHERE id=?`,
      [fournisseur_id, date_facture, qte, pu, total, pay, solde, date_echeance || null, observations || null, fichier, req.params.id]
    );

    await logAction(req.user, 'UPDATE', 'factures', `Facture #${req.params.id} modifiée`);
    const [updated] = await db.query(
      `SELECT ff.*, f.nom as fournisseur_nom FROM factures_fournisseur ff
       LEFT JOIN fournisseurs f ON ff.fournisseur_id = f.id WHERE ff.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/factures/:id — admin
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM factures_fournisseur WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvée' });
    await db.query('DELETE FROM paiements_fournisseur WHERE facture_id = ?', [req.params.id]);
    await db.query('DELETE FROM factures_fournisseur WHERE id = ?', [req.params.id]);
    await logAction(req.user, 'DELETE', 'factures', `Facture #${req.params.id} supprimée`);
    res.json({ message: 'Facture supprimée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/factures/:id/paiements
router.get('/:id/paiements', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM paiements_fournisseur WHERE facture_id = ? ORDER BY date_paiement DESC', [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/factures/:id/payer — paiement d'UNE facture précise (déduit la banque)
router.post('/:id/payer', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_paiement, montant, mode, observation, deduire_banque } = req.body;
    const mt = parseFloat(montant);
    if (!mt || mt <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const [factRows] = await conn.query('SELECT * FROM factures_fournisseur WHERE id = ?', [req.params.id]);
    if (!factRows.length) return res.status(404).json({ error: 'Facture non trouvée' });
    const facture = factRows[0];

    const nouveauSolde = Math.max(0, parseFloat(facture.solde) - mt);
    const nouveauPaye  = parseFloat(facture.paiement) + mt;

    await conn.query(
      'UPDATE factures_fournisseur SET paiement = ?, solde = ? WHERE id = ?',
      [nouveauPaye, nouveauSolde, req.params.id]
    );

    // Mettre à jour le compte fournisseur global
    await conn.query('UPDATE fournisseurs SET solde_compte = solde_compte - ? WHERE id = ?', [mt, facture.fournisseur_id]);

    let banqueMvtId = null;
    if (deduire_banque === 'true' || deduire_banque === true) {
      const [lastRow] = await conn.query('SELECT solde FROM banque_mouvements ORDER BY id DESC LIMIT 1');
      let soldePrev;
      if (lastRow.length) {
        soldePrev = parseFloat(lastRow[0].solde);
      } else {
        const [si] = await conn.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
        soldePrev = si.length ? parseFloat(si[0].valeur) : 0;
      }
      const nSoldeBanque = soldePrev - mt;

      const [fRow] = await conn.query('SELECT nom FROM fournisseurs WHERE id = ?', [facture.fournisseur_id]);
      const fNom = fRow[0]?.nom || 'Fournisseur';

      const [bqResult] = await conn.query(
        `INSERT INTO banque_mouvements (date_mouvement, description, reference, encaissement, decaissement, solde, commentaires, categorie, reference_id, reference_type)
         VALUES (?, ?, ?, 0, ?, ?, ?, 'paiement_fournisseur', ?, 'facture')`,
        [date_paiement, `Paiement facture ${facture.numero} — ${fNom}`, facture.numero,
         mt, nSoldeBanque, observation || null, req.params.id]
      );
      banqueMvtId = bqResult.insertId;
    }

    const [result] = await conn.query(
      `INSERT INTO paiements_fournisseur (facture_id, date_paiement, montant, mode, observation, banque_mvt_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, date_paiement, mt, mode || null, observation || null, banqueMvtId]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'factures',
      `Paiement fournisseur : ${mt} FCFA sur facture ${facture.numero}${banqueMvtId ? ' (déduit de la banque)' : ''}`);

    res.status(201).json({
      id: result.insertId,
      facture_solde: nouveauSolde,
      banque_mvt_id: banqueMvtId,
      message: 'Paiement enregistré'
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

// ════════════════════════════════════════════════════════════
// POST /api/factures/payer-fournisseur — PAIEMENT GLOBAL
// Paie le fournisseur directement (pas une facture précise).
// Le montant total est déduit de la banque, peu importe la dette.
// Réparti sur les factures impayées (plus anciennes d'abord),
// l'excédent devient un crédit (solde_compte négatif) consommé
// automatiquement par les futures factures.
// ════════════════════════════════════════════════════════════
router.post('/payer-fournisseur', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { fournisseur_id, date_paiement, montant, mode, observation, deduire_banque } = req.body;
    const mt = parseFloat(montant);
    if (!fournisseur_id) return res.status(400).json({ error: 'Fournisseur requis' });
    if (!mt || mt <= 0)  return res.status(400).json({ error: 'Montant invalide' });
    if (!date_paiement)  return res.status(400).json({ error: 'Date requise' });

    const [fournRows] = await conn.query('SELECT * FROM fournisseurs WHERE id = ?', [fournisseur_id]);
    if (!fournRows.length) return res.status(404).json({ error: 'Fournisseur non trouvé' });
    const fournisseur = fournRows[0];

    // ── Répartir le paiement sur les factures impayées, plus anciennes d'abord ──
    const [facturesImpayees] = await conn.query(
      'SELECT * FROM factures_fournisseur WHERE fournisseur_id = ? AND solde > 0 ORDER BY date_facture ASC, id ASC',
      [fournisseur_id]
    );

    let montantRestant = mt;
    const detailRepartition = [];

    for (const facture of facturesImpayees) {
      if (montantRestant <= 0) break;
      const soldeFacture = parseFloat(facture.solde);
      const montantApplique = Math.min(montantRestant, soldeFacture);

      const nouveauSoldeF = soldeFacture - montantApplique;
      const nouveauPayeF  = parseFloat(facture.paiement) + montantApplique;

      await conn.query(
        'UPDATE factures_fournisseur SET paiement = ?, solde = ? WHERE id = ?',
        [nouveauPayeF, nouveauSoldeF, facture.id]
      );
      await conn.query(
        `INSERT INTO paiements_fournisseur (facture_id, date_paiement, montant, mode, observation)
         VALUES (?, ?, ?, ?, ?)`,
        [facture.id, date_paiement, montantApplique, mode || null, observation || null]
      );

      detailRepartition.push({ facture_numero: facture.numero, montant_applique: montantApplique });
      montantRestant -= montantApplique;
    }

    // ── Le reliquat (si paiement > dette) devient un crédit (solde_compte négatif) ──
    const soldeCompteAvant = parseFloat(fournisseur.solde_compte || 0);
    const nouveauSoldeCompte = soldeCompteAvant - mt; // total payé déduit intégralement de la dette/crédit
    await conn.query('UPDATE fournisseurs SET solde_compte = ? WHERE id = ?', [nouveauSoldeCompte, fournisseur_id]);

    // ── Déduire intégralement de la banque (toujours le montant réel payé) ──
    let banqueMvtId = null;
    if (deduire_banque === 'true' || deduire_banque === true || deduire_banque === undefined) {
      const [lastRow] = await conn.query('SELECT solde FROM banque_mouvements ORDER BY id DESC LIMIT 1');
      let soldePrevBanque;
      if (lastRow.length) {
        soldePrevBanque = parseFloat(lastRow[0].solde);
      } else {
        const [si] = await conn.query('SELECT valeur FROM parametres WHERE cle = "solde_banque_initial"');
        soldePrevBanque = si.length ? parseFloat(si[0].valeur) : 0;
      }
      const nSoldeBanque = soldePrevBanque - mt;

      const [bqResult] = await conn.query(
        `INSERT INTO banque_mouvements (date_mouvement, description, reference, encaissement, decaissement, solde, commentaires, categorie, reference_id, reference_type)
         VALUES (?, ?, ?, 0, ?, ?, ?, 'paiement_fournisseur', ?, 'fournisseur')`,
        [date_paiement, `Paiement fournisseur — ${fournisseur.nom}`, null,
         mt, nSoldeBanque, observation || null, fournisseur_id]
      );
      banqueMvtId = bqResult.insertId;
    }

    await conn.commit();

    const messageCredit = nouveauSoldeCompte < 0
      ? ` — Crédit d'avance créé: ${Math.abs(nouveauSoldeCompte)} FCFA`
      : ` — Solde restant dû: ${nouveauSoldeCompte} FCFA`;
    await logAction(req.user, 'CREATE', 'factures',
      `Paiement global fournisseur ${fournisseur.nom} : ${mt} FCFA${messageCredit}`);

    res.status(201).json({
      message: 'Paiement enregistré',
      montant_paye: mt,
      ancien_solde_compte: soldeCompteAvant,
      nouveau_solde_compte: nouveauSoldeCompte,
      credit_avance: nouveauSoldeCompte < 0 ? Math.abs(nouveauSoldeCompte) : 0,
      solde_du: nouveauSoldeCompte > 0 ? nouveauSoldeCompte : 0,
      detail_repartition: detailRepartition,
      banque_mvt_id: banqueMvtId,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;
