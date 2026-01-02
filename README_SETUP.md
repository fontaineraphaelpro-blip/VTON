# 🚀 Guide de Setup - VTON Shopify Remix

## ✅ Migration terminée avec succès !

L'application a été migrée vers le template officiel Remix Shopify.

## 📋 Étapes de configuration

### 1. Variables d'environnement

Créer un fichier `.env` dans `vton-shopify-remix/` :

```env
SHOPIFY_API_KEY=votre_api_key_ici
SHOPIFY_API_SECRET=votre_api_secret_ici
SCOPES=read_products,write_products,read_orders,write_orders
SHOPIFY_APP_URL=https://votre-app-url.up.railway.app
DATABASE_URL=postgresql://username:password@host:5432/database
REPLICATE_API_TOKEN=votre_replicate_token_ici
```

### 2. Initialiser Prisma

```bash
cd vton-shopify-remix
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Tester localement

```bash
npm run dev
```

L'application va :
- Initialiser automatiquement les tables métier au démarrage
- Démarrer le serveur de développement
- Ouvrir l'URL fournie par Shopify CLI

### 4. Déployer sur Railway

1. **Pousser le code vers Git** :
   ```bash
   git init
   git add .
   git commit -m "Migration vers Remix Shopify"
   git remote add origin votre-repo-url
   git push -u origin main
   ```

2. **Dans Railway** :
   - Créer/mettre à jour le service
   - Connecter le nouveau repo
   - Ajouter toutes les variables d'environnement du `.env`
   - Déployer

3. **Mettre à jour Shopify Partners** :
   - App URL: `https://votre-app-url.up.railway.app`
   - Allowed redirection URL(s): `https://votre-app-url.up.railway.app/auth/callback`

## 📁 Structure des fichiers

```
vton-shopify-remix/
├── app/
│   ├── routes/
│   │   ├── app.dashboard.tsx      # Dashboard principal
│   │   ├── apps.tryon.widget.tsx  # Widget JS pour storefront
│   │   └── apps.tryon.generate.tsx # Endpoint génération
│   ├── lib/
│   │   ├── services/
│   │   │   ├── replicate.service.ts # Service Replicate
│   │   │   └── db.service.ts        # Service base de données
│   │   └── db-init.server.ts        # Initialisation tables
│   └── shopify.server.ts            # Configuration Shopify
├── prisma/
│   └── schema.prisma                # Schéma Prisma (sessions + métier)
└── package.json
```

## 🔧 Commandes utiles

```bash
# Développement
npm run dev

# Build production
npm run build

# Démarrer en production
npm start

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma studio  # Interface graphique pour la DB
```

## ⚠️ Notes importantes

1. **Base de données** : Les tables métier (shops, tryon_logs, etc.) sont créées automatiquement au démarrage via `entry.server.tsx`

2. **Routes proxy** : Les routes `/apps/tryon/*` sont publiques et vérifient la signature HMAC Shopify manuellement

3. **Authentification** : Le dashboard utilise `authenticate.admin()` pour l'authentification automatique

4. **Scopes** : Assurez-vous que les scopes dans `.env` correspondent à ceux dans Shopify Partners

## 🐛 Dépannage

### Erreur de connexion à la base de données
- Vérifier que `DATABASE_URL` est correct
- Vérifier que PostgreSQL est accessible

### Erreur OAuth / Boucle de redirection infinie
- Vérifier `SHOPIFY_API_KEY` et `SHOPIFY_API_SECRET`
- Vérifier que l'URL de redirection dans Shopify Partners correspond à `/auth/callback`
- **⚠️ Si boucle infinie entre `/auth` et `/auth/exit-iframe`** : Voir le guide détaillé dans [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
  - Utiliser HTTPS (ngrok pour le dev local, pas localhost)
  - S'assurer que `SHOPIFY_APP_URL` dans `.env` correspond exactement à l'URL dans Shopify Partners
  - Vérifier que l'URL de callback est exactement `[votre-url]/auth/callback`

### Erreur de build
- Vérifier que toutes les dépendances sont installées : `npm install`
- Vérifier que Prisma est généré : `npx prisma generate`

## 📚 Documentation

- [Remix Docs](https://remix.run/docs)
- [Shopify App Remix](https://shopify.dev/docs/apps/tools/cli/templates)
- [Polaris Components](https://polaris.shopify.com/components)



