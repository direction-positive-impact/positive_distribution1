-- Migration stock CC/CT compatible MySQL 5.7+
-- Sans "IF NOT EXISTS" sur les colonnes (non supporté sur certaines versions)
USE positive_distribution;

-- Ajouter cartons_cc si elle n'existe pas
SET @col_cc = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_actuel'
    AND COLUMN_NAME = 'cartons_cc'
);
SET @sql_cc = IF(@col_cc = 0,
  'ALTER TABLE stock_actuel ADD COLUMN cartons_cc INT NOT NULL DEFAULT 0',
  'SELECT "cartons_cc deja existante" AS info'
);
PREPARE stmt FROM @sql_cc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ajouter cartons_ct si elle n'existe pas
SET @col_ct = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_actuel'
    AND COLUMN_NAME = 'cartons_ct'
);
SET @sql_ct = IF(@col_ct = 0,
  'ALTER TABLE stock_actuel ADD COLUMN cartons_ct INT NOT NULL DEFAULT 0',
  'SELECT "cartons_ct deja existante" AS info'
);
PREPARE stmt FROM @sql_ct; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_mouvements : cartons_cc
SET @col2_cc = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_mouvements'
    AND COLUMN_NAME = 'cartons_cc'
);
SET @sql2_cc = IF(@col2_cc = 0,
  'ALTER TABLE stock_mouvements ADD COLUMN cartons_cc INT NOT NULL DEFAULT 0',
  'SELECT "ok" AS info'
);
PREPARE stmt FROM @sql2_cc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stock_mouvements : cartons_ct
SET @col2_ct = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_mouvements'
    AND COLUMN_NAME = 'cartons_ct'
);
SET @sql2_ct = IF(@col2_ct = 0,
  'ALTER TABLE stock_mouvements ADD COLUMN cartons_ct INT NOT NULL DEFAULT 0',
  'SELECT "ok" AS info'
);
PREPARE stmt FROM @sql2_ct; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Colonnes CC/CT ajoutees ou deja presentes' AS etape;

-- Initialiser les valeurs depuis les livraisons existantes
UPDATE stock_actuel sa
SET
  sa.cartons_cc = (
    SELECT COALESCE(SUM(l.quantite_cartons), 0)
    FROM livraisons l
    JOIN fournisseurs f ON l.fournisseur_id = f.id
    WHERE LOWER(f.nom) LIKE '%cameroun%'
  ),
  sa.cartons_ct = (
    SELECT COALESCE(SUM(l.quantite_cartons), 0)
    FROM livraisons l
    JOIN fournisseurs f ON l.fournisseur_id = f.id
    WHERE LOWER(f.nom) LIKE '%tchad%'
  )
WHERE sa.id = 1;

-- Mettre a jour les mouvements
UPDATE stock_mouvements sm
JOIN livraisons l ON sm.reference_id = l.id AND sm.reference_type = 'livraison'
JOIN fournisseurs f ON l.fournisseur_id = f.id
SET
  sm.cartons_cc = CASE WHEN LOWER(f.nom) LIKE '%cameroun%' THEN sm.cartons ELSE 0 END,
  sm.cartons_ct = CASE WHEN LOWER(f.nom) LIKE '%tchad%'    THEN sm.cartons ELSE 0 END
WHERE sm.type_mouvement = 'entree';

SELECT
  cartons     AS stock_total,
  cartons_cc  AS stock_cameroun_CC,
  cartons_ct  AS stock_tchad_CT
FROM stock_actuel WHERE id = 1;

SELECT 'Migration terminee avec succes' AS resultat;

-- Migration : colonnes cartons en DECIMAL pour supporter les demi-cartons
ALTER TABLE stock_actuel
  MODIFY COLUMN cartons    DECIMAL(10,1) NOT NULL DEFAULT 0,
  MODIFY COLUMN cartons_cc DECIMAL(10,1) NOT NULL DEFAULT 0,
  MODIFY COLUMN cartons_ct DECIMAL(10,1) NOT NULL DEFAULT 0;

ALTER TABLE stock_mouvements
  MODIFY COLUMN cartons    DECIMAL(10,1) NOT NULL DEFAULT 0,
  MODIFY COLUMN cartons_cc DECIMAL(10,1) NOT NULL DEFAULT 0,
  MODIFY COLUMN cartons_ct DECIMAL(10,1) NOT NULL DEFAULT 0;

ALTER TABLE ventes
  MODIFY COLUMN quantite DECIMAL(10,1) NOT NULL DEFAULT 0;

SELECT 'Migration decimaux terminee' AS resultat;
