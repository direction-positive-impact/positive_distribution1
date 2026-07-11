// routes/rapports.js
const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// ── Utilitaire : prix d'achat moyen pondéré des fournisseurs actifs ──
async function getPrixAchatMoyen() {
  const [rows] = await db.query(
    `SELECT prix_unitaire FROM prix_achat
     WHERE actif = 1`
  );
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + Number(r.prix_unitaire), 0);
  return total / rows.length;
}

// GET /api/rapports/marge/:date — marge bénéficiaire du jour
router.get('/marge/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;

    const [ventes] = await db.query(
      'SELECT quantite, prix_unitaire, total FROM ventes WHERE date_vente = ?',
      [date]
    );

    const prixAchatMoyen = await getPrixAchatMoyen();
    const totalQteVendue = ventes.reduce((s, v) => s + Number(v.quantite), 0);
    const totalVentes     = ventes.reduce((s, v) => s + Number(v.total), 0);
    const totalCoutAchat  = totalQteVendue * prixAchatMoyen;
    const margeBrute      = totalVentes - totalCoutAchat;
    const margeParCarton  = totalQteVendue > 0 ? margeBrute / totalQteVendue : 0;

    res.json({
      date,
      prix_achat_moyen: prixAchatMoyen,
      quantite_vendue: totalQteVendue,
      total_ventes: totalVentes,
      total_cout_achat: totalCoutAchat,
      marge_brute: margeBrute,
      marge_par_carton: margeParCarton,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/rapports/:date — données pour rapport journalier
router.get('/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;

    const [ventes] = await db.query(
      `SELECT v.*, c.nom as client_nom, c.zone as client_zone
       FROM ventes v LEFT JOIN clients c ON v.client_id = c.id
       WHERE v.date_vente = ? ORDER BY v.id`,
      [date]
    );

    const [livraisons] = await db.query(
      'SELECT * FROM livraisons WHERE date_livraison = ?', [date]
    );

    const [recouvrements] = await db.query(
      `SELECT r.*, c.nom as client_nom
       FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id
       WHERE r.date_paiement = ? ORDER BY r.id`,
      [date]
    );

    const [pertes] = await db.query(
      'SELECT * FROM pertes WHERE date_perte = ?', [date]
    );

    const [stock] = await db.query('SELECT * FROM stock_actuel WHERE id = 1');

    const [impayes] = await db.query(
      `SELECT nom, zone, categorie, solde_global
       FROM clients WHERE solde_global > 0 ORDER BY solde_global DESC`
    );

    const [banque] = await db.query(
      'SELECT * FROM banque_mouvements WHERE date_mouvement = ? ORDER BY id', [date]
    );

    const totalVentes = ventes.reduce((s, v) => s + Number(v.total), 0);
    const totalPaye = ventes.reduce((s, v) => s + Number(v.paiement), 0);
    const totalImpayesVentes = ventes.reduce((s, v) => s + Number(v.solde), 0);
    const totalRecouvr = recouvrements.reduce((s, r) => s + Number(r.montant_recu), 0);
    const totalCash = totalPaye + totalRecouvr;
    const totalQte = ventes.reduce((s, v) => s + Number(v.quantite), 0);
    const totalImpayesGlobal = impayes.reduce((s, c) => s + Number(c.solde_global), 0);

    // Marge du jour incluse dans le rapport
    const prixAchatMoyen = await getPrixAchatMoyen();
    const margeBrute = totalVentes - (totalQte * prixAchatMoyen);

    res.json({
      date,
      ventes,
      livraisons,
      recouvrements,
      pertes,
      stock: stock[0] || { cartons: 0, plateaux: 0, oeufs: 0 },
      impayes,
      banque,
      totaux: {
        totalVentes,
        totalPaye,
        totalImpayesVentes,
        totalRecouvr,
        totalCash,
        totalQte,
        totalImpayesGlobal,
        margeBrute,
        prixAchatMoyen,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
