-- ============================================================
--  Script de réparation pour base déjà initialisée avec
--  l'ancien init.sql (qui plantait sur ALTER TABLE)
--  À exécuter UNE FOIS si vous avez déjà la base créée
--  Usage : mysql -u root -p positive_distribution < fix_base_existante.sql
-- ============================================================
USE positive_distribution;

-- 1. Ajouter les colonnes manquantes sur banque_mouvements
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

-- 2. Créer la table parametres si absente
CREATE TABLE IF NOT EXISTS parametres (
  cle    VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NOT NULL
);
INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial', '0');
INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial_date', CURDATE());

-- 3. Créer les tables fournisseurs/factures si absentes (au cas où)
CREATE TABLE IF NOT EXISTS fournisseurs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(150) NOT NULL,
  telephone   VARCHAR(50)  NULL,
  adresse     TEXT NULL,
  statut      ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  observation TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prix_achat (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  fournisseur_id  INT NOT NULL,
  date_effet      DATE NOT NULL,
  prix_unitaire   DECIMAL(10,0) NOT NULL,
  actif           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
);

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

CREATE TABLE IF NOT EXISTS paiements_fournisseur (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  facture_id    INT NOT NULL,
  date_paiement DATE NOT NULL,
  montant       DECIMAL(15,0) NOT NULL,
  mode          VARCHAR(50) NULL,
  observation   TEXT NULL,
  banque_mvt_id INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (facture_id) REFERENCES factures_fournisseur(id)
);

-- 4. Recalculer les soldes bancaires existants à partir du solde initial
-- (au cas où des mouvements ont déjà été créés avec des soldes incorrects)
SET @solde_init = (SELECT CAST(valeur AS DECIMAL(15,0)) FROM parametres WHERE cle = 'solde_banque_initial');

SELECT '✅ Réparation terminée — tables créées et colonnes ajoutées' AS message;
SELECT 'Si vos mouvements bancaires existants ont un solde incorrect, ouvrez la page Banque dans l''application et cliquez sur "Solde initial" pour les recalculer.' AS note;

-- ════════════════════════════════════════════════════════════
-- Réparation 2 — Compte fournisseur avec crédit/dette
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
  END IF;
END //
DELIMITER ;
CALL pd_add_solde_compte();
DROP PROCEDURE pd_add_solde_compte;

-- Initialiser solde_compte avec la dette actuelle (somme des factures impayées)
UPDATE fournisseurs f
SET solde_compte = (
  SELECT COALESCE(SUM(solde), 0) FROM factures_fournisseur WHERE fournisseur_id = f.id
);

SELECT '✅ Colonne solde_compte ajoutée et initialisée' AS message;
