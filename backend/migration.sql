-- ============================================================
--  Migration — corrections et nouvelles fonctionnalités
-- ============================================================
USE positive_distribution;

-- 1. Colonne fichier_facture sur livraisons (si pas encore là)
ALTER TABLE livraisons 
  MODIFY COLUMN fichier_facture VARCHAR(255) NULL;

-- 2. Colonne fichier_bordereau sur banque_mouvements (si pas encore là)  
ALTER TABLE banque_mouvements
  MODIFY COLUMN fichier_bordereau VARCHAR(255) NULL;

-- 3. Fix dates — stocker en DATE pas DATETIME
ALTER TABLE stock_mouvements 
  MODIFY COLUMN date_mouvement DATE NOT NULL;

-- 4. Journal d'activité
CREATE TABLE IF NOT EXISTS journal_activite (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  date_action   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  utilisateur_id INT NOT NULL,
  utilisateur_nom VARCHAR(100) NOT NULL,
  action        VARCHAR(50) NOT NULL,   -- CREATE, UPDATE, DELETE, LOGIN
  module        VARCHAR(50) NOT NULL,   -- ventes, clients, stock, etc.
  description   TEXT NOT NULL,
  ip            VARCHAR(45) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT '✅ Migration OK' AS message;
