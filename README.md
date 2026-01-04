# VTON - Virtual Try-On Shopify App

Application Shopify pour le Virtual Try-On utilisant Remix et Replicate.

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18.20+ ou 20.10+ ou 21.0+
- Compte Shopify Partners
- Base de données PostgreSQL
- Token API Replicate

### Installation

1. **Cloner et installer les dépendances** :
   ```bash
   cd vton-shopify-remix
   npm install
   ```

2. **Configurer les variables d'environnement** :
   
   Créer un fichier `.env` :
   ```env
   SHOPIFY_API_KEY=votre_api_key_ici
   SHOPIFY_API_SECRET=votre_api_secret_ici
   SCOPES=read_products,write_script_tags
   SHOPIFY_APP_URL=https://votre-app-url.up.railway.app
   DATABASE_URL=postgresql://username:password@host:5432/database
   REPLICATE_API_TOKEN=votre_replicate_token_ici
   ```

3. **Initialiser Prisma** :
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Lancer en développement** :
   ```bash
   npm run dev
   ```

## 📁 Structure du projet

```
vton-shopify-remix/
├── app/
│   ├── routes/
│   │   ├── app.dashboard.tsx      # Dashboard principal
│   │   ├── apps.tryon.widget.tsx  # Widget JS pour storefront
│   │   └── apps.tryon.generate.tsx # Endpoint génération try-on
│   ├── lib/
│   │   ├── services/
│   │   │   ├── replicate.service.ts # Service Replicate
│   │   │   └── db.service.ts        # Service base de données
│   │   └── db-init.server.ts        # Initialisation tables métier
│   └── shopify.server.ts            # Configuration Shopify
├── prisma/
│   └── schema.prisma                # Schéma Prisma (sessions + métier)
└── package.json
```

## 🔧 Commandes disponibles

```bash
# Développement
npm run dev

# Build production
npm run build

# Démarrer en production
npm start

# Prisma
npx prisma generate      # Générer le client Prisma
npx prisma migrate dev    # Créer une migration
npx prisma studio         # Interface graphique pour la DB
```

## 📚 Documentation

- [Remix Docs](https://remix.run/docs)
- [Shopify App Remix](https://shopify.dev/docs/apps/tools/cli/templates)
- [Polaris Components](https://polaris.shopify.com/components)

## 🚢 Déploiement

### Railway

1. Pousser le code vers Git
2. Dans Railway, connecter le repo
3. Configurer les variables d'environnement
4. Déployer

### Configuration Shopify Partners

- **App URL**: `https://votre-app-url.up.railway.app`
- **Allowed redirection URL(s)**: `https://votre-app-url.up.railway.app/auth/callback`

## ⚠️ Notes importantes

- Les tables métier (shops, tryon_logs, etc.) sont créées automatiquement au démarrage
- Les routes `/apps/tryon/*` sont publiques et vérifient la signature HMAC Shopify
- Le dashboard utilise l'authentification automatique via `authenticate.admin()`

## 🐛 Dépannage

### Erreur de connexion à la base de données
- Vérifier que `DATABASE_URL` est correct
- Vérifier que PostgreSQL est accessible

### Erreur OAuth
- Vérifier `SHOPIFY_API_KEY` et `SHOPIFY_API_SECRET`
- Vérifier que l'URL de redirection dans Shopify Partners correspond à `/auth/callback`

### Erreur de build
- Vérifier que toutes les dépendances sont installées : `npm install`
- Vérifier que Prisma est généré : `npx prisma generate`
