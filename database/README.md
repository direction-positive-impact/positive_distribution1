# Scripts SQL

## init_complet.sql
Script de réinitialisation complète.
**Utilisation :** Uniquement si tu veux repartir de zéro.
Exécuter sur la base `positive_distribution` dans TablePlus/DBeaver.

## migration_stock_cc_ct.sql
Migration à exécuter UNE SEULE FOIS pour ajouter les colonnes `cartons_cc` et `cartons_ct`.
**Statut :** À exécuter si ces colonnes n'existent pas encore en base.

## Sauvegardes automatiques
Utilise le menu **Sauvegarde BD** dans l'application pour télécharger une sauvegarde `.sql` à tout moment.
