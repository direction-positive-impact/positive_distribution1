// routes/backup.js
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

const TABLES_ORDER = [
  'utilisateurs','categories_clients','prix_carton',
  'fournisseurs','prix_achat','clients','livraisons',
  'ventes','recouvrements','stock_actuel','stock_mouvements',
  'pertes','banque_mouvements','factures_fournisseur',
  'paiements_fournisseur','afrocaisse_mouvements','depenses',
  'parametres','journal_activite',
];

function escapeVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  let s = String(val);
  // Convertir les dates ISO en format MySQL
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) s = s.slice(0,19).replace('T',' ');
  s = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'');
  return `'${s}'`;
}

// GET /api/backup/export — genere un fichier .sql complet
router.get('/export', auth, adminOnly, async (req, res) => {
  try {
    const ts       = new Date().toISOString().slice(0,19).replace(/[:.]/g,'-');
    const filename = `backup_positive_${ts}.sql`;
    let totalRows  = 0;
    let sql = '';
    sql += `-- ============================================================\n`;
    sql += `-- Sauvegarde Positive Distribution\n`;
    sql += `-- Date : ${new Date().toLocaleString('fr-FR')}\n`;
    sql += `-- ============================================================\n\n`;
    sql += `USE positive_distribution;\n`;
    sql += `SET FOREIGN_KEY_CHECKS = 0;\n`;
    sql += `SET NAMES utf8mb4;\n\n`;

    for (const table of TABLES_ORDER) {
      try {
        const [rows] = await db.query(`SELECT * FROM \`${table}\``);
        sql += `-- ${table} (${rows.length} lignes)\n`;
        sql += `TRUNCATE TABLE \`${table}\`;\n`;
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
          for (const row of rows) {
            const vals = Object.values(row).map(escapeVal).join(', ');
            sql += `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});\n`;
          }
          totalRows += rows.length;
        }
        sql += '\n';
      } catch (e) {
        sql += `-- Table ${table} ignoree : ${e.message}\n\n`;
      }
    }

    sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    sql += `SELECT 'Restauration terminee' AS resultat;\n`;

    await logAction(req.user, 'EXPORT', 'backup',
      `Sauvegarde SQL exportee : ${filename} — ${totalRows} lignes`);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (e) {
    res.status(500).json({ error: 'Erreur export : ' + e.message });
  }
});

// GET /api/backup/stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const stats = {};
    const tables = ['clients','ventes','recouvrements','livraisons','depenses','factures_fournisseur'];
    for (const t of tables) {
      try {
        const [[r]] = await db.query(`SELECT COUNT(*) as n FROM \`${t}\``);
        stats[t] = Number(r.n);
      } catch(e) { stats[t] = 0; }
    }
    const [lv] = await db.query('SELECT MAX(date_vente) as d FROM ventes');
    const [lr] = await db.query('SELECT MAX(date_paiement) as d FROM recouvrements');
    res.json({
      stats,
      derniere_vente:       lv[0].d,
      dernier_recouvrement: lr[0].d,
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
