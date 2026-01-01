# 🚂 Configuration Railway - Guide Rapide

## ⚠️ Erreur : "SHOPIFY_APP_URL is required"

Cette erreur signifie que les variables d'environnement ne sont **PAS configurées dans Railway**.

## ✅ Solution : Configurer les Variables dans Railway

### Étape 1 : Ouvrir Railway

1. Va sur [railway.app](https://railway.app)
2. Ouvre ton projet **VTON**
3. Clique sur ton **service** (celui qui déploie l'app)

### Étape 2 : Ajouter les Variables

1. Clique sur l'onglet **"Variables"** (ou **"Environment"**)
2. Clique sur **"New Variable"** ou **"Raw Editor"**
3. Ajoute **TOUTES** ces variables :

```env
SHOPIFY_API_KEY=votre_api_key_ici
SHOPIFY_API_SECRET=votre_api_secret_ici
SCOPES=read_products,write_products,read_orders,write_orders
SHOPIFY_APP_URL=https://votre-app.up.railway.app
DATABASE_URL=postgresql://username:password@host:5432/database
REPLICATE_API_TOKEN=votre_replicate_token_ici
```

**💡 Astuce** : Tu peux copier les valeurs depuis ton fichier `.env` local.

### Étape 3 : Vérifier SHOPIFY_APP_URL

⚠️ **IMPORTANT** : `SHOPIFY_APP_URL` doit être l'URL **exacte** de ton app Railway.

1. Va dans l'onglet **"Settings"** de ton service
2. Trouve la section **"Domains"** ou **"Networking"**
3. Copie l'URL complète (ex: `https://vton-production-890a.up.railway.app`)
4. Utilise cette URL pour `SHOPIFY_APP_URL`

### Étape 4 : Redéployer

1. Après avoir ajouté les variables, **redéploie** l'app
2. Clique sur **"Deploy"** ou **"Redeploy"**
3. Attends que le build se termine
4. Vérifie les logs - l'erreur devrait disparaître

## 🔍 Vérification

Après configuration, les logs devraient montrer :
- ✅ Pas d'erreur "SHOPIFY_APP_URL is required"
- ✅ L'app démarre correctement
- ✅ Tu peux accéder à l'URL de ton app

## 📝 Notes Importantes

- **Le fichier `.env` local** ne sert que pour le développement local
- **Railway a besoin** que tu configures les variables dans leur interface
- **Chaque variable** doit être sur une ligne séparée
- **Pas d'espaces** autour du `=` dans les variables

## 🐛 Si ça ne marche toujours pas

1. **Vérifie l'orthographe** : `SHOPIFY_APP_URL` (pas `SHOPIFY_APP_URLS`)
2. **Vérifie le format** : Doit commencer par `https://`
3. **Vérifie que tu as cliqué sur "Save"** après avoir ajouté les variables
4. **Redéploie** après chaque modification de variables

