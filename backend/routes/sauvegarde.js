// routes/sauvegarde.js
// Sauvegarde et restauration des données
// Exporte toutes les tables en JSON — sans mot de passes ni tokens
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

const TABLES_SAUVEGARDE = [
  'categories_clients',
  'clients',
  'fournisseurs',
  'prix_achat',
  'prix_carton',
  'livraisons',
  'ventes',
  'recouvrements',
  'stock_actuel',
  'stock_mouvements',
  'pertes',
  'banque_mouvements',
  'factures_fournisseur',
  'paiements_fournisseur',
  'depenses',
  'afrocaisse_mouvements',
  'parametres',
];

// ─── GET /api/sauvegarde ─────────────────────────────────────
// Télécharger une sauvegarde complète en JSON
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const sauvegarde = {
      version:    '1.0',
      date:       new Date().toISOString(),
      application:'Positive Distribution',
      tables:     {},
    };

    for (const table of TABLES_SAUVEGARDE) {
      try {
        const [rows] = await db.query(`SELECT * FROM ${table}`);
        sauvegarde.tables[table] = rows;
      } catch (e) {
        sauvegarde.tables[table] = []; // table absente = vide
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const nom = `sauvegarde_positive_${dateStr}.json`;

    await logAction(
      req.user, 'EXPORT', 'sauvegarde',
      `Sauvegarde exportée : ${nom} — ${Object.values(sauvegarde.tables).reduce((s,t)=>s+t.length,0)} enregistrements`
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.json(sauvegarde);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
  }
});

// ─── GET /api/sauvegarde/stats ───────────────────────────────
// Statistiques rapides sans export complet
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const stats = {};
    for (const table of TABLES_SAUVEGARDE) {
      try {
        const [[{ n }]] = await db.query(`SELECT COUNT(*) as n FROM ${table}`);
        stats[table] = Number(n);
      } catch (e) {
        stats[table] = 0;
      }
    }
    res.json({
      stats,
      total: Object.values(stats).reduce((s,n)=>s+n,0),
      date:  new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/sauvegarde/restaurer ─────────────────────────
// Restaurer depuis un fichier JSON (admin seulement)
router.post('/restaurer', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { tables, version, date: dateSauvegarde } = req.body;

    if (!tables || typeof tables !== 'object') {
      return res.status(400).json({ error: 'Format invalide — fichier de sauvegarde incorrect' });
    }

    const rapport = { restaures: {}, erreurs: {} };
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Restaurer dans l'ordre (respecter les FK)
    for (const table of TABLES_SAUVEGARDE) {
      if (!tables[table] || !tables[table].length) {
        rapport.restaures[table] = 0;
        continue;
      }
      try {
        await conn.query(`TRUNCATE TABLE ${table}`);
        const rows = tables[table];
        const cols = Object.keys(rows[0]).join(', ');
        const placeholders = '(' + Object.keys(rows[0]).map(() => '?').join(', ') + ')';
        for (const row of rows) {
          await conn.query(
            `INSERT INTO ${table} (${cols}) VALUES ${placeholders}`,
            Object.values(row)
          );
        }
        rapport.restaures[table] = rows.length;
      } catch (e) {
        rapport.erreurs[table] = e.message;
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();

    const total = Object.values(rapport.restaures).reduce((s,n)=>s+n,0);
    await logAction(
      req.user, 'IMPORT', 'sauvegarde',
      `Restauration depuis sauvegarde du ${dateSauvegarde || 'inconnu'} — ${total} enregistrements`
    );

    res.json({
      message: `Restauration terminée — ${total} enregistrements restaurés`,
      rapport,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la restauration : ' + e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
