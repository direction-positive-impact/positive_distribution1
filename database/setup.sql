-- ============================================================
--  SCRIPT COMPLET FINAL -- Positive Distribution
--  Creation tables + donnees au 01/07/2026
--  Sans accents dans les valeurs SQL
--  Mot de passe tous les comptes : Pimpact
-- ============================================================

-- Creation de la base si elle n'existe pas
CREATE DATABASE IF NOT EXISTS positive_distribution
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE positive_distribution;

-- ============================================================
-- PARTIE 1 : CREATION DES TABLES
-- ============================================================

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

CREATE TABLE IF NOT EXISTS parametres (
  cle    VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO stock_actuel (id, cartons, plateaux, oeufs) VALUES (1, 0, 0, 0);

SELECT 'Tables creees' AS etape;

-- ============================================================
-- PARTIE 2 : NETTOYAGE COMPLET
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE paiements_fournisseur;
TRUNCATE TABLE factures_fournisseur;
TRUNCATE TABLE prix_achat;
TRUNCATE TABLE fournisseurs;
TRUNCATE TABLE journal_activite;
TRUNCATE TABLE banque_mouvements;
TRUNCATE TABLE recouvrements;
TRUNCATE TABLE stock_mouvements;
TRUNCATE TABLE pertes;
TRUNCATE TABLE ventes;
TRUNCATE TABLE clients;
TRUNCATE TABLE categories_clients;
TRUNCATE TABLE prix_carton;
TRUNCATE TABLE parametres;
TRUNCATE TABLE livraisons;
DELETE FROM utilisateurs;
UPDATE stock_actuel SET cartons=0, plateaux=0, oeufs=0 WHERE id=1;
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Nettoyage termine' AS etape;

-- ============================================================
-- PARTIE 3 : UTILISATEURS
-- Mot de passe pour tous : Pimpact
-- ============================================================

INSERT INTO utilisateurs (nom, email, mot_de_passe, role) VALUES
('Oumar',      'oumar@pimpact.net',            '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
('Abdoulaye',  'abdoulaye.khalid@pimpact.net', '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
('Brahim',     'brahim@pimpact.net',           '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
('Zenab',      'zeinab@pimpact.net',           '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
('Bechir',     'bechir@pimpact.net',           '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Commercial'),
('Moussa',     'moussa@pimpact.net',           '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Commercial');

-- ============================================================
-- PARTIE 4 : CATEGORIES DE PRIX
-- ============================================================

INSERT INTO categories_clients (id, nom, prix_unitaire, description) VALUES
(1, 'Revendeur Principal',    31500, 'Revendeurs principaux zone NDjamena'),
(2, 'Revendeur Strategique',  31000, 'Ali Chari Labane - prix special'),
(3, 'Depot Vente Directe',    32000, 'Gestionnaires ventes directes'),
(4, 'Autre Revendeur',        32500, 'Revendeurs autres regions provinces'),
(5, 'Patisserie Conso',       33000, 'Patisseries et consommateurs directs');

INSERT INTO prix_carton (date_effet, categorie, prix_unitaire, actif) VALUES
('2026-07-01', 'revendeur_principal',    31500, 1),
('2026-07-01', 'revendeur_strategique',  31000, 1),
('2026-07-01', 'autre_revendeur',        32500, 1),
('2026-07-01', 'patisserie_conso',       33000, 1);

-- ============================================================
-- PARTIE 5 : FOURNISSEURS ET PRIX D'ACHAT
-- ============================================================

INSERT INTO fournisseurs (id, nom, statut, solde_compte) VALUES
(1, 'Fournisseur Cameroun CC', 'actif', 0),
(2, 'Fournisseur Tchad CT',    'actif', 0);

INSERT INTO prix_achat (fournisseur_id, date_effet, prix_unitaire, actif) VALUES
(1, '2026-07-01', 30000, 1),
(2, '2026-07-01', 29500, 1);

-- ============================================================
-- PARTIE 6 : PARAMETRES
-- ============================================================

INSERT INTO parametres (cle, valeur) VALUES
('solde_banque_initial',      '0'),
('solde_banque_initial_date', '2026-07-01');

SELECT 'Donnees de base inserees' AS etape;

-- ============================================================
-- PARTIE 7 : CLIENTS
-- Soldes = etat AVANT la journee du 01/07/2026
--
-- CLI-001 Chaibo       : solde 157 500  / avance 0
-- CLI-002 Goni Gassi   : solde 283 500  / avance 0
-- CLI-003 Adam Issakha : solde 1260 000 / avance 0
-- CLI-004 Mht Ismail   : solde 925 000  / avance 0
-- CLI-005 Achou        : solde 0        / avance 36 500
-- CLI-006 Ali Chari    : solde 0        / avance 0
-- CLI-007 Mht Djidda   : solde 557 000  / avance 0
-- CLI-008 Hakim        : solde 125 000  / avance 0
-- CLI-009 H.M.Massaguet: solde 1657 500 / avance 0
-- CLI-010 H.M.Bitkine  : solde 325 000  / avance 0
-- CLI-011 Moussa Kelo  : solde 120 000  / avance 0
-- CLI-012 Abeche       : solde 347 500  / avance 0
-- CLI-013 AG           : solde 264 000  / avance 0
-- CLI-014 SPP          : solde 0        / avance 0
-- CLI-015 Pain Dore    : solde 0        / avance 0
-- CLI-016 Clients Div. : solde 0        / avance 0
-- ============================================================

INSERT INTO clients
  (code, nom, zone, categorie, categorie_id, solde_global, solde_avance, observation, statut)
VALUES
  ('CLI-001', 'Voisin Chaibo Dembe',           'Dembe',             'revendeur_principal',   1,  157500,      0, NULL,                   'actif'),
  ('CLI-002', 'Goni Gassi',                    'Gassi',             'revendeur_principal',   1,  283500,      0, NULL,                   'actif'),
  ('CLI-003', 'Adam Issakha Idriss Farcha',    'Farcha Djougoulie', 'revendeur_principal',   1, 1260000,      0, NULL,                   'actif'),
  ('CLI-004', 'Mht Ismail Farcha Djougoulie',  'Farcha Djougoulie', 'revendeur_principal',   1,  925000,      0, NULL,                   'actif'),
  ('CLI-005', 'Achou Farcha Djougoulie',       'Farcha Djougoulie', 'revendeur_principal',   1,       0,  36500, 'Avance 36500',         'actif'),
  ('CLI-006', 'Ali Chari Labane',              NULL,                'revendeur_strategique', 2,       0,      0, 'Prix 31000 par carton','actif'),
  ('CLI-007', 'Vente Directe Mht Djidda',      NULL,                'autre_revendeur',       3,  557000,      0, 'Prix 32000 par carton','actif'),
  ('CLI-008', 'Vente Directe Hakim Rue 50',    NULL,                'autre_revendeur',       3,  125000,      0, 'Prix 32000 par carton','actif'),
  ('CLI-009', 'Hadje Mariam Massaguet',        'Massaguet',         'autre_revendeur',       4, 1657500,      0, NULL,                   'actif'),
  ('CLI-010', 'Hadje Mariam Bitkine',          'Bitkine',           'autre_revendeur',       4,  325000,      0, NULL,                   'actif'),
  ('CLI-011', 'Moussa Kelo',                   NULL,                'autre_revendeur',       4,  120000,      0, NULL,                   'actif'),
  ('CLI-012', 'Abba Ali Souleymane Abeche',    'Abeche',            'autre_revendeur',       4,  347500,      0, NULL,                   'actif'),
  ('CLI-013', 'AG',                            NULL,                'patisserie_conso',      5,  264000,      0, 'Facture transmise',    'actif'),
  ('CLI-014', 'SPP Sopetrans',                 NULL,                'patisserie_conso',      5,       0,      0, NULL,                   'actif'),
  ('CLI-015', 'Pain Dore',                     NULL,                'patisserie_conso',      5,       0,      0, NULL,                   'actif'),
  ('CLI-016', 'Clients Divers',                NULL,                'patisserie_conso',      5,       0,      0, NULL,                   'actif');

SELECT 'Clients inseres' AS etape;

-- ============================================================
-- PARTIE 8 : LIVRAISON DU 01/07/2026
-- 74 cartons recus : 40 Adam + 30 Ali Chari + 4 Hakim
-- ============================================================

INSERT INTO livraisons (date_livraison, quantite_cartons, fournisseur_id, fournisseur, notes)
VALUES ('2026-07-01', 74, 1, 'Fournisseur Cameroun CC',
        '40 cartons Adam Issakha + 30 cartons Ali Chari + 4 cartons Hakim');

UPDATE stock_actuel SET cartons=74, plateaux=0, oeufs=0 WHERE id=1;

INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif)
VALUES ('2026-07-01', 'entree', 74, 0, 0, 'Livraison 01/07/2026 - 74 cartons');

-- ============================================================
-- PARTIE 9 : VENTES DU 01/07/2026
-- Logique : la vente cree la dette totale
-- Tout paiement est un recouvrement separe
--
-- Adam Issakha (CLI-003) : 40 x 31500 = 1 260 000
--   dette avant = 1 260 000, apres vente = 2 520 000
-- Ali Chari    (CLI-006) : 30 x 31000 =   930 000
--   dette avant = 0, apres vente = 930 000
-- Hakim        (CLI-008) :  4 x 32000 =   128 000
--   dette avant = 125 000, apres vente = 253 000
-- ============================================================

INSERT INTO ventes
  (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, observations)
VALUES
  ('2026-07-01', 'VTE-01-001', 3, 40, 31500, 1260000, 0, 1260000, '40 cartons CC - livraison reportee du 30/06'),
  ('2026-07-01', 'VTE-01-002', 6, 30, 31000,  930000, 0,  930000, '30 cartons CC - prix strategique 31000'),
  ('2026-07-01', 'VTE-01-003', 8,  4, 32000,  128000, 0,  128000, '4 cartons - depot prix 32000');

-- Deduire du stock (74 distribues = stock 0)
UPDATE stock_actuel SET cartons=0, plateaux=0, oeufs=0 WHERE id=1;

INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif)
VALUES ('2026-07-01', 'sortie', 74, 0, 0, 'Distribution 01/07/2026 - 74 cartons');

-- Ajouter les dettes aux soldes clients
UPDATE clients SET solde_global = solde_global + 1260000 WHERE id=3;
UPDATE clients SET solde_global = solde_global +  930000 WHERE id=6;
UPDATE clients SET solde_global = solde_global +  128000 WHERE id=8;

SELECT 'Ventes 01/07 inserees' AS etape;

-- ============================================================
-- PARTIE 10 : RECOUVREMENTS DU 01/07/2026
-- Total cash : 2 007 500
--
-- Adam Issakha : paie 860 000
--   dette = 2 520 000, reste = 1 660 000, avance = 0
-- Ali Chari : paie 930 000
--   dette = 930 000, reste = 0, avance = 0
-- Achou : paie 60 000
--   dette = 0, avance creee = 60 000
--   avance finale = 36 500 (avant) + 60 000 = 96 500
-- Chaibo : paie 157 500
--   dette = 157 500, reste = 0, avance = 0
-- ============================================================

-- Adam Issakha : 860 000 recus, reste 1 660 000
INSERT INTO recouvrements
  (client_id, date_paiement, montant_recu, montant_restant, avance_creee, observation)
VALUES (3, '2026-07-01', 860000, 1660000, 0, NULL);
UPDATE clients SET solde_global=1660000 WHERE id=3;

-- Ali Chari : 930 000 recus, solde
INSERT INTO recouvrements
  (client_id, date_paiement, montant_recu, montant_restant, avance_creee, observation)
VALUES (6, '2026-07-01', 930000, 0, 0, 'Vente soldee sur place');
UPDATE clients SET solde_global=0 WHERE id=6;

-- Achou : 60 000 recus, avance creee = 60 000
-- avance finale = 36 500 + 60 000 = 96 500
INSERT INTO recouvrements
  (client_id, date_paiement, montant_recu, montant_restant, avance_creee, observation)
VALUES (5, '2026-07-01', 60000, 0, 60000, 'Avance supplementaire');
UPDATE clients SET solde_avance=96500 WHERE id=5;

-- Chaibo : 157 500 recus, solde
INSERT INTO recouvrements
  (client_id, date_paiement, montant_recu, montant_restant, avance_creee, observation)
VALUES (1, '2026-07-01', 157500, 0, 0, 'Solde solde');
UPDATE clients SET solde_global=0 WHERE id=1;

SELECT 'Recouvrements 01/07 inseres' AS etape;

-- ============================================================
-- VERIFICATION FINALE
-- ============================================================

SELECT
  c.nom,
  FORMAT(c.solde_global, 0) AS impaye_FCFA,
  FORMAT(c.solde_avance, 0) AS avance_FCFA,
  CASE
    WHEN c.solde_avance > 0 AND c.solde_global = 0 THEN 'Avance'
    WHEN c.solde_global > 0 THEN 'Impaye'
    ELSE 'Solde'
  END AS statut
FROM clients c
ORDER BY c.solde_global DESC;

SELECT
  FORMAT(SUM(solde_global), 0) AS total_impayes,
  '6 392 500 attendu'          AS reference
FROM clients
WHERE solde_global > 0;

SELECT
  FORMAT(SUM(montant_recu), 0) AS cash_01juillet,
  '2 007 500 attendu'          AS reference
FROM recouvrements
WHERE date_paiement = '2026-07-01';

SELECT
  cartons        AS stock_final,
  '0 attendu'   AS reference
FROM stock_actuel WHERE id=1;

SELECT 'Base Positive Distribution prete' AS resultat;

-- Tables Depenses + Afrocaisse (ajout post-initial)
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

INSERT IGNORE INTO parametres (cle, valeur) VALUES ('afrocaisse_initial', '0');

-- Tables depenses et afrocaisse
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

INSERT IGNORE INTO parametres (cle, valeur) VALUES ('afrocaisse_initial', '0');

SELECT 'Setup complet termine' AS resultat;
