// routes/rapports.js
const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// ── Prix d'achat moyen pondéré des fournisseurs actifs ──
async function getPrixAchatMoyen() {
  const [rows] = await db.query('SELECT prix_unitaire FROM prix_achat WHERE actif = 1');
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + Number(r.prix_unitaire), 0);
  return total / rows.length;
}

// GET /api/rapports/marge/:date
router.get('/marge/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;
    const [ventes] = await db.query(
      'SELECT quantite, prix_unitaire, total FROM ventes WHERE date_vente = ?', [date]
    );
    const prixAchatMoyen = await getPrixAchatMoyen();
    const totalQteVendue = ventes.reduce((s, v) => s + Number(v.quantite), 0);
    const totalVentes    = ventes.reduce((s, v) => s + Number(v.total), 0);
    const totalCoutAchat = totalQteVendue * prixAchatMoyen;
    const margeBrute     = totalVentes - totalCoutAchat;
    const margeParCarton = totalQteVendue > 0 ? margeBrute / totalQteVendue : 0;

    res.json({
      date, prixAchatMoyen, quantite_vendue: totalQteVendue,
      total_ventes: totalVentes, total_cout_achat: totalCoutAchat,
      marge_brute: margeBrute, marge_par_carton: margeParCarton,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/rapports/:date — rapport journalier complet
router.get('/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;

    const [ventes] = await db.query(
      `SELECT v.*, c.nom as client_nom, c.zone as client_zone
       FROM ventes v LEFT JOIN clients c ON v.client_id = c.id
       WHERE v.date_vente = ? ORDER BY v.id`, [date]
    );

    const [livraisons] = await db.query(
      'SELECT * FROM livraisons WHERE date_livraison = ?', [date]
    );

    const [recouvrements] = await db.query(
      `SELECT r.*, c.nom as client_nom
       FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id
       WHERE r.date_paiement = ? ORDER BY r.id`, [date]
    );

    const [pertes] = await db.query('SELECT * FROM pertes WHERE date_perte = ?', [date]);
    const [stock]   = await db.query('SELECT * FROM stock_actuel WHERE id = 1');
    const [impayes] = await db.query(
      `SELECT nom, zone, categorie, solde_global
       FROM clients WHERE solde_global > 0 ORDER BY solde_global DESC`
    );
    const [banque]  = await db.query(
      'SELECT * FROM banque_mouvements WHERE date_mouvement = ? ORDER BY id', [date]
    );

    // ── Stock reconstruit au soir du jour demandé ──
    // On prend le stock actuel et on remonte dans le temps jusqu'à la date du rapport
    // en annulant les mouvements postérieurs à cette date
    const [mouvApres] = await db.query(
      `SELECT type_mouvement, SUM(cartons) as total
       FROM stock_mouvements WHERE date_mouvement > ? GROUP BY type_mouvement`, [date]
    );
    const entresApres  = Number(mouvApres.find(m => m.type_mouvement === 'entree')?.total || 0);
    const sortiesApres = Number(mouvApres.find(m => m.type_mouvement === 'sortie')?.total || 0);
    const stockActuel  = stock[0] || { cartons: 0, plateaux: 0, oeufs: 0 };
    // Stock final du jour = stock actuel - entrées postérieures + sorties postérieures
    const stockFinalJour = stockActuel.cartons - entresApres + sortiesApres;

    // Mouvements du jour pour avoir entrées/sorties
    const [mouvJour] = await db.query(
      `SELECT type_mouvement, SUM(cartons) as total
       FROM stock_mouvements WHERE date_mouvement = ? GROUP BY type_mouvement`, [date]
    );
    const entreJour  = Number(mouvJour.find(m => m.type_mouvement === 'entree')?.total || 0);
    const sortieJour = Number(mouvJour.find(m => m.type_mouvement === 'sortie')?.total || 0);

    // Stock initial du jour = stock final du jour - entrées du jour + sorties du jour
    const stockInitial = stockFinalJour - entreJour + sortieJour;
    const stockFinal = {
      cartons:    stockFinalJour,
      cartons_cc: stockActuel.cartons_cc || 0,
      cartons_ct: stockActuel.cartons_ct || 0,
      plateaux:   stockActuel.plateaux,
      oeufs:      stockActuel.oeufs,
    };

    // Fournisseurs pour section 5 du PDF
    const [fournisseurs] = await db.query(
      'SELECT id, nom, solde_compte FROM fournisseurs WHERE statut = "actif" ORDER BY nom'
    );

    // Ventes par type de carton (CC/CT)
    const totalQteCC = ventes.filter(v => (v.type_carton||'CC') === 'CC').reduce((s,v) => s+Number(v.quantite),0);
    const totalQteCT = ventes.filter(v => (v.type_carton||'CC') === 'CT').reduce((s,v) => s+Number(v.quantite),0);

    const totalVentes        = ventes.reduce((s, v) => s + Number(v.total), 0);
    const totalQte           = ventes.reduce((s, v) => s + Number(v.quantite), 0);
    const totalImpayesVentes = ventes.reduce((s, v) => s + Number(v.solde), 0);
    const totalImpayesGlobal = impayes.reduce((s, c) => s + Number(c.solde_global), 0);
    const totalCash = recouvrements.reduce((s, r) => s + Number(r.montant_recu), 0);

    const prixAchatMoyen = await getPrixAchatMoyen();
    const margeBrute     = totalVentes - (totalQte * prixAchatMoyen);

    res.json({
      date, ventes, livraisons, recouvrements, pertes,
      stock:          stockFinal,
      stock_initial:  stockInitial,
      stock_entre:    entreJour,
      stock_sorti:    sortieJour,
      fournisseurs,
      impayes, banque,
      totaux: {
        totalVentes, totalQte, totalQteCC, totalQteCT,
        totalImpayesVentes,
        totalCash,
        totalImpayesGlobal,
        margeBrute, prixAchatMoyen,
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
