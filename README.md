# Positive Distribution

Application de gestion de distribution d'oeufs — N'Djamena, Tchad.

## Stack
- Backend : Node.js / Express / MySQL
- Frontend : HTML / CSS / JavaScript (vanilla)
- Hébergement : Railway

## Installation locale

```bash
cd backend
cp .env.example .env
# Remplir .env avec vos identifiants MySQL locaux

npm install
npm start
```

Ouvrir : http://localhost:3001

## Base de données

Créer la structure :
```sql
-- Exécuter backend/init.sql sur votre base MySQL
```

Les données ne sont PAS sur GitHub.
Utiliser le module **Sauvegarde & Restauration** dans l'application pour exporter/importer les données.

## Déploiement Railway

Variables d'environnement à configurer dans Railway :
- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`
- `JWT_SECRET`
- `NODE_ENV=production`
