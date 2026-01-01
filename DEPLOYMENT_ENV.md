# 🔧 Configuration des Variables d'Environnement pour le Déploiement

## ⚠️ Erreur : "Detected an empty appUrl configuration"

Cette erreur signifie que la variable `SHOPIFY_APP_URL` n'est pas définie dans votre conteneur Docker.

## 📋 Variables d'Environnement Requises

Vous devez configurer ces variables dans votre plateforme de déploiement (Railway, Heroku, etc.) :

### Variables Obligatoires

```env
SHOPIFY_API_KEY=votre_api_key_ici
SHOPIFY_API_SECRET=votre_api_secret_ici
SCOPES=read_products,write_products,read_orders,write_orders
SHOPIFY_APP_URL=https://votre-app-url.up.railway.app
DATABASE_URL=postgresql://username:password@host:5432/database
REPLICATE_API_TOKEN=votre_replicate_token_ici
```

### Variables Optionnelles

```env
SHOP_CUSTOM_DOMAIN=votre-domaine-custom.com  # Si vous utilisez un domaine custom
```

## 🚀 Configuration sur Railway

1. **Allez dans votre projet Railway**
2. **Cliquez sur votre service**
3. **Onglet "Variables"**
4. **Ajoutez toutes les variables ci-dessus**

### ⚠️ Important pour SHOPIFY_APP_URL

- **URL complète** : `https://votre-app.up.railway.app` (avec https://)
- **Sans slash final** : Pas de `/` à la fin
- **Doit correspondre** à l'URL configurée dans Shopify Partners

## 🔍 Vérification

Après avoir configuré les variables :

1. **Redéployez** votre application
2. **Vérifiez les logs** - l'erreur devrait disparaître
3. **Testez l'URL** : `https://votre-app-url.up.railway.app`

## 📝 Exemple de Configuration Railway

```
Variables:
  SHOPIFY_API_KEY = abc123...
  SHOPIFY_API_SECRET = xyz789...
  SCOPES = read_products,write_products,read_orders,write_orders
  SHOPIFY_APP_URL = https://vton-app.up.railway.app
  DATABASE_URL = postgresql://user:pass@host:5432/db
  REPLICATE_API_TOKEN = r8_...
```

## 🐛 Dépannage

### L'erreur persiste après configuration

1. **Vérifiez l'orthographe** : `SHOPIFY_APP_URL` (pas `SHOPIFY_APP_URLS` ou autre)
2. **Vérifiez le format** : Doit commencer par `https://`
3. **Redéployez** après avoir ajouté les variables
4. **Vérifiez les logs** pour voir si les variables sont bien chargées

### Comment vérifier que les variables sont chargées

Ajoutez temporairement dans `app/shopify.server.ts` :

```typescript
console.log('SHOPIFY_APP_URL:', process.env.SHOPIFY_APP_URL);
```

Puis regardez les logs du conteneur.

## 📚 Documentation Shopify

- [Déploiement Shopify Apps](https://shopify.dev/docs/apps/launch/deployment/deploy-web-app/deploy-to-hosting-service#step-4-set-up-environment-variables)

