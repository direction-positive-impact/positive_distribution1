# Déployer Positive Distribution gratuitement — Render + Aiven

Cette combinaison est **gratuite en continu**, sans carte bancaire requise, contrairement à Railway dont le crédit gratuit n'est qu'un essai de 30 jours.

| Composant | Service | Coût |
|---|---|---|
| Backend Node.js (API + frontend) | Render — Web Service gratuit | 0 $ |
| Base de données MySQL | Aiven — Free Tier MySQL | 0 $ |

**Seule vraie contrainte à connaître :** le service Render gratuit s'endort après 15 minutes sans requête. Au prochain accès, il se réveille en 30 à 60 secondes — un peu lent, mais sans aucune perte de données. Pour un usage interne avec quelques utilisateurs qui n'ouvrent pas l'app en continu, c'est tout à fait gérable.

---

## Partie 1 — Créer la base de données MySQL gratuite sur Aiven

### 1.1 Créer le compte et le service

1. Va sur https://aiven.io et crée un compte (pas de carte bancaire demandée pour le free tier)
2. Dans la console, clique sur **Create service**
3. Choisis **MySQL**
4. Sélectionne le plan **Free**
5. Choisis une région proche de toi ou de tes utilisateurs (ex: Europe)
6. Donne un nom au service (ex: `positive-distribution-db`) et clique sur **Create service**

Le service met une à deux minutes à démarrer.

### 1.2 Récupérer les informations de connexion

Une fois le service actif (statut vert "Running") :

1. Va dans l'onglet **Overview** du service
2. Note les informations affichées :
   - **Host** (ex: `mysql-xxxxx.aivencloud.com`)
   - **Port** (ex: `12345`)
   - **User** (généralement `avnadmin`)
   - **Password** (clique sur l'œil pour l'afficher)
   - **Default database name** (généralement `defaultdb`)
3. Télécharge le **certificat CA** (bouton de téléchargement à côté de "CA Certificate") — fichier `ca.pem`. Tu en auras besoin pour la connexion chiffrée.

### 1.3 Initialiser la base avec ton script SQL

Tu as deux façons de lancer `init.sql` sur cette base distante :

**Option A — avec un client graphique (le plus simple) :** ouvre TablePlus, DBeaver, ou MySQL Workbench, crée une nouvelle connexion avec les informations ci-dessus (active le SSL dans les options de connexion, en pointant vers le fichier `ca.pem` téléchargé), connecte-toi, puis exécute le contenu de `backend/init.sql`.

**Option B — en ligne de commande**, depuis le dossier `backend` :
```bash
mysql --host=mysql-xxxxx.aivencloud.com --port=12345 --user=avnadmin --password \
  --ssl-ca=chemin/vers/ca.pem defaultdb < init.sql
```
(remplace les valeurs par les tiennes, et indique le bon chemin vers `ca.pem`)

---

## Partie 2 — Déployer le backend sur Render

### 2.1 Créer le Web Service

1. Va sur https://render.com et connecte-toi avec ton compte GitHub
2. Clique sur **New** → **Web Service**
3. Sélectionne ton repo `positive-distribution`
4. Configure :
   - **Name** : `positive-distribution` (ou ce que tu veux)
   - **Root Directory** : `backend` (important, car ton code backend est dans ce sous-dossier)
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**

### 2.2 Configurer les variables d'environnement

Dans la section **Environment Variables** (toujours pendant la création, ou plus tard dans **Environment** une fois le service créé), ajoute :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | une chaîne aléatoire longue (génère-la en local avec la commande ci-dessous) |
| `MYSQLHOST` | l'host Aiven noté plus haut |
| `MYSQLPORT` | le port Aiven |
| `MYSQLUSER` | `avnadmin` |
| `MYSQLPASSWORD` | le mot de passe Aiven |
| `MYSQLDATABASE` | `defaultdb` |
| `DB_SSL_CA` | le contenu complet du fichier `ca.pem` (voir ci-dessous) |

Pour générer le `JWT_SECRET`, lance en local :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Pour `DB_SSL_CA`** : ouvre le fichier `ca.pem` téléchargé avec un éditeur de texte, copie tout son contenu (il commence par `-----BEGIN CERTIFICATE-----` et finit par `-----END CERTIFICATE-----`), et colle-le tel quel comme valeur de la variable. Render accepte les valeurs multi-lignes dans ses variables d'environnement, donc pas besoin de l'encoder.

### 2.3 Lancer le déploiement

Clique sur **Create Web Service** (ou **Deploy** si tu avais déjà créé le service). Render va :
1. Cloner ton repo
2. Lancer `npm install` dans le dossier `backend`
3. Démarrer avec `npm start`

Suis les logs en direct dans l'onglet **Logs**. Tu dois voir apparaître `✅ MySQL connecté` et `🚀 Serveur démarré`.

### 2.4 Récupérer l'URL publique

Render génère automatiquement une URL du type `https://positive-distribution.onrender.com`, visible en haut de la page du service. C'est l'adresse à partager avec ton équipe.

Ouvre cette URL : la page de connexion doit s'afficher. Connecte-toi avec `oumar@pimpact.net` / `Pimpact` pour vérifier que tout fonctionne, y compris la connexion à la base de données.

---

## ⚠️ Points d'attention à connaître

### Le service s'endort après 15 minutes d'inactivité
C'est le compromis du gratuit : si personne n'utilise l'app pendant 15 minutes, Render met le service en pause. La prochaine personne qui ouvre l'app attendra 30 à 60 secondes avant que la page ne réponde, le temps que le service redémarre. Aucune donnée n'est perdue, c'est juste un délai au réveil.

Si ça devient gênant pour ton équipe, une astuce gratuite existe : un service externe comme **UptimeRobot** (gratuit) peut envoyer une requête à ton app toutes les 5 minutes pour la garder éveillée. Je peux te montrer comment faire si besoin, une fois que le déploiement de base fonctionne.

### Les fichiers uploadés (factures, bordereaux) ne sont pas permanents
Le dossier `backend/uploads/` où sont stockés les scans de factures et bordereaux **sera vidé à chaque redéploiement** (par exemple quand tu pousses une mise à jour du code). C'est une limite du système de fichiers éphémère de Render, pas un bug.

Pour l'instant, si tu redéploies rarement, ce n'est pas bloquant. Si ça devient un problème, la solution gratuite la plus simple plus tard serait d'utiliser un service de stockage externe comme Cloudinary (offre gratuite généreuse pour les images/PDF) — je peux adapter le code si tu en as besoin.

### Aiven peut suspendre un service gratuit jugé inactif
<br>D'après la documentation Aiven, les services gratuits inutilisés pendant longtemps peuvent être arrêtés (avec notification préalable), mais restent réactivables à tout moment d'un clic. Tant que ton équipe utilise l'app régulièrement, ça ne devrait pas arriver.

---

## Mises à jour futures

Chaque fois que tu pousses du code sur la branche connectée de ton repo GitHub (généralement `main`), Render redéploie automatiquement — pas de commande supplémentaire à lancer. Pense juste à exporter/sauvegarder les fichiers uploadés importants avant un déploiement si tu en as accumulé, puisqu'ils seront effacés.
