-- ============================================================
--  init.sql — Positive Distribution
--  Structure uniquement (pas de données)
--  Les données sont gérées via la sauvegarde JSON
-- ============================================================

CREATE DATABASE IF NOT EXISTS positive_distribution
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE positive_distribution;

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NOT NULL,
  role          ENUM('Admin','Commercial') NOT NULL DEFAULT 'Commercial',
  statut        ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  dernier_acces DATETIME NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories_clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prix_unitaire DECIMAL(10,0) NOT NULL,
  description   TEXT NULL,
  actif         TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  nom           VARCHAR(150) NOT NULL,
  telephone     VARCHAR(50) NULL,
  zone          VARCHAR(100) NULL,
  adresse       TEXT NULL,
  categorie     ENUM('revendeur_principal','autre_revendeur','revendeur_strategique','patisserie_conso')
                NOT NULL DEFAULT 'autre_revendeur',
  categorie_id  INT NULL,
  statut        ENUM('actif','inactif','archive') NOT NULL DEFAULT 'actif',
  solde_global  DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde_avance  DECIMAL(15,0) NOT NULL DEFAULT 0,
  observation   TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categorie_id) REFERENCES categories_clients(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prix_carton (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  date_effet    DATE NOT NULL,
  categorie     ENUM('revendeur_principal','revendeur_strategique','autre_revendeur','patisserie_conso') NOT NULL,
  prix_unitaire DECIMAL(10,0) NOT NULL,
  actif         TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fournisseurs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nom          VARCHAR(150) NOT NULL,
  telephone    VARCHAR(50) NULL,
  adresse      TEXT NULL,
  statut       ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  observation  TEXT NULL,
  solde_compte DECIMAL(15,0) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS livraisons (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  date_livraison   DATE NOT NULL,
  quantite_cartons INT NOT NULL,
  fournisseur_id   INT NULL,
  fournisseur      VARCHAR(150) NULL,
  notes            TEXT NULL,
  fichier_facture  VARCHAR(255) NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prix_achat (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  fournisseur_id INT NOT NULL,
  date_effet     DATE NOT NULL,
  prix_unitaire  DECIMAL(10,0) NOT NULL,
  actif          TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ventes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  date_vente    DATE NOT NULL,
  numero        VARCHAR(20) NOT NULL UNIQUE,
  client_id     INT NOT NULL,
  quantite      INT NOT NULL,
  prix_unitaire DECIMAL(10,0) NOT NULL,
  total         DECIMAL(15,0) NOT NULL,
  paiement      DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde         DECIMAL(15,0) NOT NULL DEFAULT 0,
  observations  TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recouvrements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  date_paiement   DATE NOT NULL,
  montant_recu    DECIMAL(15,0) NOT NULL,
  montant_restant DECIMAL(15,0) NOT NULL DEFAULT 0,
  avance_creee    DECIMAL(15,0) NOT NULL DEFAULT 0,
  date_suivi      DATE NULL,
  observation     TEXT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_actuel (
  id         INT PRIMARY KEY DEFAULT 1,
  cartons    INT NOT NULL DEFAULT 0,
  cartons_cc INT NOT NULL DEFAULT 0,
  cartons_ct INT NOT NULL DEFAULT 0,
  plateaux   INT NOT NULL DEFAULT 0,
  oeufs      INT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_mouvements (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement DATE NOT NULL,
  type_mouvement ENUM('entree','sortie','perte','ajustement') NOT NULL,
  cartons        INT NOT NULL DEFAULT 0,
  cartons_cc     INT NOT NULL DEFAULT 0,
  cartons_ct     INT NOT NULL DEFAULT 0,
  plateaux       INT NOT NULL DEFAULT 0,
  oeufs          INT NOT NULL DEFAULT 0,
  motif          TEXT NOT NULL,
  reference_id   INT NULL,
  reference_type VARCHAR(50) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pertes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  date_perte     DATE NOT NULL,
  type_perte     ENUM('casse','perte','manquant','abime') NOT NULL DEFAULT 'casse',
  quantite_oeufs INT NOT NULL,
  cause          TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banque_mouvements (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement    DATE NOT NULL,
  description       VARCHAR(255) NOT NULL,
  reference         VARCHAR(100) NULL,
  encaissement      DECIMAL(15,0) NOT NULL DEFAULT 0,
  decaissement      DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde             DECIMAL(15,0) NOT NULL DEFAULT 0,
  commentaires      TEXT NULL,
  fichier_bordereau VARCHAR(255) NULL,
  categorie         VARCHAR(50) NULL DEFAULT 'autre',
  reference_id      INT NULL,
  reference_type    VARCHAR(50) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_activite (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  date_action     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  utilisateur_id  INT NOT NULL,
  utilisateur_nom VARCHAR(100) NOT NULL,
  action          VARCHAR(50) NOT NULL,
  module          VARCHAR(50) NOT NULL,
  description     TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
  FOREIGN KEY (livraison_id)   REFERENCES livraisons(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS afrocaisse_mouvements (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement DATE NOT NULL,
  type_mouvement ENUM('entree','sortie') NOT NULL,
  montant        DECIMAL(15,0) NOT NULL,
  solde          DECIMAL(15,0) NOT NULL DEFAULT 0,
  description    TEXT NULL,
  depense_id     INT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS depenses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type_depense VARCHAR(100) NOT NULL,
  montant      DECIMAL(15,0) NOT NULL,
  date_depense DATE NOT NULL,
  beneficiaire VARCHAR(150) NULL,
  description  TEXT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parametres (
  cle    VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ligne stock unique
INSERT IGNORE INTO stock_actuel (id, cartons, cartons_cc, cartons_ct, plateaux, oeufs)
VALUES (1, 0, 0, 0, 0, 0);

SELECT 'Structure Positive Distribution creee avec succes' AS message;
