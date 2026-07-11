# Démarrage local — Positive Distribution

## Étape 1 : Installer les dépendances

Ouvre un terminal dans le dossier `backend/` et exécute :

```bash
npm install
```

## Étape 2 : Créer le fichier .env

Dans le dossier `backend/`, crée un fichier nommé `.env` avec ce contenu :

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TON_MOT_DE_PASSE_MYSQL
DB_NAME=positive_distribution
JWT_SECRET=dev_secret_local_12345
PORT=3001
NODE_ENV=development
```

Remplace `TON_MOT_DE_PASSE_MYSQL` par ton mot de passe MySQL local.

## Étape 3 : Initialiser la base de données

```bash
mysql -u root -p < database/setup.sql
```

Puis exécuter la migration stock :

```bash
mysql -u root -p < database/migration_stock_cc_ct.sql
```

## Étape 4 : Démarrer le serveur

```bash
npm start
```

Ouvre http://localhost:3001 dans ton navigateur.

---

## Pousser vers GitHub (sans exposer la BD)

```bash
git add .
git commit -m "Ma mise a jour"
git push origin main
```

Le fichier `.env` et les fichiers `*.sql` sont ignorés automatiquement par `.gitignore`.
Les données Railway ne bougent pas quand tu pousses le code.

---

## Sauvegarde de la base de données

Depuis l'application : menu **Sauvegarde BD** (admin uniquement)
→ Télécharge un fichier `.sql` complet que tu gardes en lieu sûr.

Pour restaurer depuis une sauvegarde :
```bash
mysql -u root -p positive_distribution < backup_positive_dist_XXXX.sql
```
