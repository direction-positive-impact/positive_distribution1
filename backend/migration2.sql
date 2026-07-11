-- ============================================================
--  Migration 2 — Fournisseurs, Factures, Banque enrichie
-- ============================================================
USE positive_distribution;

-- ── Fournisseurs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fournisseurs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(150) NOT NULL,
  telephone   VARCHAR(50)  NULL,
  adresse     TEXT NULL,
  statut      ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  observation TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Prix d'achat par fournisseur (historique, comme prix_carton) ──
CREATE TABLE IF NOT EXISTS prix_achat (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  fournisseur_id  INT NOT NULL,
  date_effet      DATE NOT NULL,
  prix_unitaire   DECIMAL(10,0) NOT NULL,
  actif           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
);

-- ── Factures fournisseur ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures_fournisseur (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  numero          VARCHAR(30) NOT NULL UNIQUE,
  fournisseur_id  INT NOT NULL,
  date_facture    DATE NOT NULL,
  quantite        INT NOT NULL,
  prix_unitaire   DECIMAL(10,0) NOT NULL,
  total           DECIMAL(15,0) NOT NULL,
  paiement        DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde           DECIMAL(15,0) NOT NULL DEFAULT 0,
  date_echeance   DATE NULL,
  observations    TEXT NULL,
  fichier_facture VARCHAR(255) NULL,
  livraison_id    INT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id),
  FOREIGN KEY (livraison_id) REFERENCES livraisons(id)
);

-- ── Paiements de factures fournisseur ─────────────────────────
CREATE TABLE IF NOT EXISTS paiements_fournisseur (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  facture_id  INT NOT NULL,
  date_paiement DATE NOT NULL,
  montant     DECIMAL(15,0) NOT NULL,
  mode        VARCHAR(50) NULL,
  observation TEXT NULL,
  banque_mvt_id INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (facture_id) REFERENCES factures_fournisseur(id)
);

-- ── Banque : enrichir avec catégorie et solde initial ─────────
DROP PROCEDURE IF EXISTS pd_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE pd_add_column_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'categorie'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN categorie VARCHAR(50) NULL DEFAULT 'autre';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'reference_id'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN reference_id INT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'reference_type'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN reference_type VARCHAR(50) NULL;
  END IF;
END //
DELIMITER ;
CALL pd_add_column_if_missing();
DROP PROCEDURE pd_add_column_if_missing;

-- Paramètres généraux (pour solde bancaire initial)
CREATE TABLE IF NOT EXISTS parametres (
  cle    VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NOT NULL
);

INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial', '0');
INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial_date', CURDATE());

SELECT '✅ Migration 2 OK — Fournisseurs, Factures, Banque enrichie' AS message;

-- ════════════════════════════════════════════════════════════
-- Migration 3 — Compte fournisseur avec crédit/dette
-- ════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS pd_add_solde_compte;
DELIMITER //
CREATE PROCEDURE pd_add_solde_compte()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fournisseurs' AND COLUMN_NAME = 'solde_compte'
  ) THEN
    ALTER TABLE fournisseurs ADD COLUMN solde_compte DECIMAL(15,0) NOT NULL DEFAULT 0;
    -- positif = le fournisseur nous doit... non : positif = NOUS devons au fournisseur
    -- négatif = nous avons payé d'avance (crédit chez le fournisseur)
  END IF;
END //
DELIMITER ;
CALL pd_add_solde_compte();
DROP PROCEDURE pd_add_solde_compte;

-- Initialiser solde_compte = somme des soldes de factures impayées actuelles
UPDATE fournisseurs f
SET solde_compte = (
  SELECT COALESCE(SUM(solde), 0) FROM factures_fournisseur WHERE fournisseur_id = f.id
)
WHERE solde_compte = 0;

SELECT '✅ Migration 3 OK — Compte fournisseur avec crédit/dette' AS message;
