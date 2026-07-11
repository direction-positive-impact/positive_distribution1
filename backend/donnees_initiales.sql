-- ============================================================
--  Données initiales — Rapport du 30/06/2026
--  Positive Distribution — Tchad
--
--  À exécuter UNE SEULE FOIS sur ta base Railway
--  Commande : mysql -h HOST -P PORT -u root -p positive_distribution < donnees_initiales.sql
--  (ou colle le contenu directement dans un client MySQL)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. NETTOYAGE DES DONNÉES DE TEST
--    (supprime les données vides créées par init.sql)
-- ────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE recouvrements;
TRUNCATE TABLE stock_mouvements;
TRUNCATE TABLE ventes;
TRUNCATE TABLE clients;
SET FOREIGN_KEY_CHECKS = 1;

-- ────────────────────────────────────────────────────────────
-- 1. CLIENTS AVEC SOLDES IMPAYÉS CUMULÉS
--    Soldes = cumul accumulé depuis plusieurs semaines/mois
-- ────────────────────────────────────────────────────────────
INSERT INTO clients
  (code, nom, zone, categorie, telephone, solde_global, statut)
VALUES
  ('CLI-001', 'Mht-Djidda',          NULL,       'revendeur_principal', NULL,  541000, 'actif'),
  ('CLI-002', 'H. Mariam Massaguet', 'Massaguet','autre_revendeur',     NULL, 1657500, 'actif'),
  ('CLI-003', 'Goni Gassi',          'Gassi',    'autre_revendeur',     NULL,  283500, 'actif'),
  ('CLI-004', 'Chaibo',              NULL,       'revendeur_principal', NULL,  157500, 'actif'),
  ('CLI-005', 'SPP',                 NULL,       'patisserie_conso',    NULL,       0, 'actif'),
  ('CLI-006', 'Mht Ismail',          'Farcha',   'revendeur_principal', NULL,  925000, 'actif'),
  ('CLI-007', 'Achou',               'Farcha',   'revendeur_principal', NULL,       0, 'actif'),
  ('CLI-008', 'Adam Ishakh',         'Farcha',   'revendeur_principal', NULL, 1260000, 'actif'),
  ('CLI-009', 'Abeche',              'Abéché',   'autre_revendeur',     NULL,  347500, 'actif'),
  ('CLI-010', 'AG',                  NULL,       'patisserie_conso',    NULL,  264000, 'actif'),
  ('CLI-011', 'Moussa Kelo',         NULL,       'autre_revendeur',     NULL,  120000, 'actif'),
  ('CLI-012', 'H. Mariam Bitkine',   'Bitkine',  'autre_revendeur',     NULL,  325000, 'actif'),
  ('CLI-013', 'Abdoulhakim',         NULL,       'autre_revendeur',     NULL,  125000, 'actif');

-- ────────────────────────────────────────────────────────────
-- 2. VENTES DU 30/06/2026
--
--    CC = Cameroun, CT = Tchad — même prix pour l'instant
--    Prix : revendeur_principal=29000, autre_revendeur=29500, patisserie_conso=33000
--
--    16,5 CC pour Mht-Djidda : l'appli gère les cartons entiers,
--    on enregistre 16 cartons + note les 6 plateaux en observation.
--    Les 0,5 = 6 plateaux seront régularisés à la prochaine vente.
-- ────────────────────────────────────────────────────────────
INSERT INTO ventes
  (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, observations)
VALUES
  -- Mht-Djidda : 16,5 CC → 16 cartons enregistrés, 6 plateaux en note
  ('2026-06-30', 'VTE-001',
   (SELECT id FROM clients WHERE code = 'CLI-001'),
   16, 29000, 464000, 0, 464000,
   '16,5 CC (Cameroun) — 6 plateaux restants à régulariser à la prochaine livraison'),

  -- H. Mariam Massaguet : 21 CC
  ('2026-06-30', 'VTE-002',
   (SELECT id FROM clients WHERE code = 'CLI-002'),
   21, 29500, 619500, 0, 619500,
   '21 CC (Cameroun)'),

  -- Goni Gassi : 9 CC
  ('2026-06-30', 'VTE-003',
   (SELECT id FROM clients WHERE code = 'CLI-003'),
   9, 29500, 265500, 0, 265500,
   '9 CC (Cameroun)'),

  -- Chaïbo : 5 CT
  ('2026-06-30', 'VTE-004',
   (SELECT id FROM clients WHERE code = 'CLI-004'),
   5, 29000, 145000, 0, 145000,
   '5 CT (Tchad)'),

  -- SPP : 1 carton, payé sur place
  ('2026-06-30', 'VTE-005',
   (SELECT id FROM clients WHERE code = 'CLI-005'),
   1, 33000, 33000, 33000, 0,
   '1 carton — réglé sur place');

-- Répercuter les soldes des ventes sur les fiches clients
-- (les soldes initiaux sont les cumuls passés, on ajoute les soldes des ventes du jour)
UPDATE clients SET solde_global = solde_global + 464000 WHERE code = 'CLI-001'; -- Mht-Djidda
UPDATE clients SET solde_global = solde_global + 619500 WHERE code = 'CLI-002'; -- H. Mariam Massaguet
UPDATE clients SET solde_global = solde_global + 265500 WHERE code = 'CLI-003'; -- Goni Gassi
UPDATE clients SET solde_global = solde_global + 145000 WHERE code = 'CLI-004'; -- Chaibo
-- SPP : soldé, pas d'ajout

-- ────────────────────────────────────────────────────────────
-- 3. RECOUVREMENTS DU 30/06/2026
--    Cash total encaissé : 1 183 000 FCFA
--    (SPP 33 000 déjà dans la vente → pas de recouvrement séparé)
-- ────────────────────────────────────────────────────────────

-- Mht Ismail : 650 000 reçus
INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation)
VALUES (
  (SELECT id FROM clients WHERE code = 'CLI-006'),
  '2026-06-30', 650000,
  (SELECT solde_global FROM clients WHERE code = 'CLI-006') - 650000,
  NULL
);
UPDATE clients SET solde_global = GREATEST(0, solde_global - 650000) WHERE code = 'CLI-006';

-- Achou : 260 000 reçus dont 36 500 d'avance (son solde était 0)
-- L'avance de 36 500 est notée — à déduire de sa prochaine vente manuellement
INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation)
VALUES (
  (SELECT id FROM clients WHERE code = 'CLI-007'),
  '2026-06-30', 260000, 0,
  'Dont 36 500 FCFA d''avance sur prochaine vente. A déduire lors de la prochaine facturation.'
);
-- Son solde reste 0 (l'avance dépasse la dette actuelle de 0)

-- Mht-Djidda : 200 000 reçus
INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation)
VALUES (
  (SELECT id FROM clients WHERE code = 'CLI-001'),
  '2026-06-30', 200000,
  (SELECT solde_global FROM clients WHERE code = 'CLI-001') - 200000,
  NULL
);
UPDATE clients SET solde_global = GREATEST(0, solde_global - 200000) WHERE code = 'CLI-001';

-- Abdoulhakim : 100 000 reçus
INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation)
VALUES (
  (SELECT id FROM clients WHERE code = 'CLI-013'),
  '2026-06-30', 100000,
  (SELECT solde_global FROM clients WHERE code = 'CLI-013') - 100000,
  NULL
);
UPDATE clients SET solde_global = GREATEST(0, solde_global - 100000) WHERE code = 'CLI-013';

-- ────────────────────────────────────────────────────────────
-- 4. STOCK — 34 cartons (Adam Ishakh non livré, reporté)
-- ────────────────────────────────────────────────────────────
UPDATE stock_actuel SET cartons = 34, plateaux = 0, oeufs = 0 WHERE id = 1;

INSERT INTO stock_mouvements
  (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif)
VALUES
  ('2026-06-30', 'ajustement', 34, 0, 0,
   'Stock initial 30/06/2026 — 34 CT. Adam Ishakh absent, livraison reportée au 01/07.');

-- ────────────────────────────────────────────────────────────
-- 5. VÉRIFICATION — À lire après exécution
-- ────────────────────────────────────────────────────────────
SELECT '=== CLIENTS ===' AS info, '' AS valeur
UNION ALL SELECT nom, CONCAT(FORMAT(solde_global,0), ' FCFA')
FROM clients ORDER BY nom;

SELECT '=== TOTAUX ===' AS info, '' AS valeur
UNION ALL
SELECT 'Total impayés',
  CONCAT(FORMAT(SUM(solde_global),0), ' FCFA') FROM clients WHERE solde_global > 0
UNION ALL
SELECT 'Nombre de clients', CONCAT(COUNT(*), ' clients') FROM clients
UNION ALL
SELECT 'Ventes du 30/06', CONCAT(COUNT(*), ' ventes') FROM ventes WHERE date_vente = '2026-06-30'
UNION ALL
SELECT 'Stock actuel', CONCAT(cartons, ' cartons') FROM stock_actuel WHERE id = 1;

SELECT '✅ Données du 30/06/2026 insérées avec succès' AS resultat;
