# Guide pour supprimer l'extension de thème et créer une nouvelle version

## Problème

L'extension de thème "vton-widget" existe dans votre app Shopify mais n'est plus nécessaire. Le widget est maintenant chargé via Script Tags au lieu d'une extension de thème.

## Solution : Créer une nouvelle version sans extensions

### Étape 1 : Supprimer l'extension existante dans Shopify

#### Option A : Via Shopify CLI

```bash
# Lister les extensions
shopify app generate extension

# Ou supprimer directement via l'API
# (nécessite d'être connecté à votre app)
```

#### Option B : Via Shopify Partner Dashboard

1. **Aller sur** [Shopify Partner Dashboard](https://partners.shopify.com)
2. **Sélectionner votre app** "Try-On StyleLab"
3. **Aller dans "Extensions"** ou "App setup"
4. **Trouver l'extension "vton-widget"** (Handle: vton-widget)
5. **Cliquer sur "Delete"** ou "Remove"

#### Option C : Via l'API GraphQL

Si vous avez accès à l'API, vous pouvez supprimer l'extension :

```graphql
mutation appExtensionDelete($id: ID!) {
  appExtensionDelete(id: $id) {
    deletedId
    userErrors {
      field
      message
    }
  }
}
```

### Étape 2 : Vérifier la configuration actuelle

Le fichier `shopify.app.toml` ne contient **aucune configuration d'extension**, ce qui est correct. L'app utilise maintenant uniquement :

- ✅ **Script Tags** (installés automatiquement via le Dashboard)
- ✅ **App Proxy** (pour les routes `/apps/tryon/*`)

### Étape 3 : Créer une nouvelle version de l'app

#### Via Shopify CLI

```bash
# 1. S'assurer que vous êtes dans le bon répertoire
cd vton-shopify-remix

# 2. Vérifier la configuration
shopify app info

# 3. Déployer la nouvelle version (sans extensions)
shopify app deploy

# 4. Ou pour un développement local
shopify app dev
```

#### Via Shopify Partner Dashboard

1. **Aller sur** [Shopify Partner Dashboard](https://partners.shopify.com)
2. **Sélectionner votre app**
3. **Aller dans "Versions"** ou "Releases"
4. **Créer une nouvelle version** (si disponible)
5. **Soumettre pour révision** (si nécessaire)

### Étape 4 : Vérifier que l'extension est supprimée

1. **Aller dans votre store Shopify**
2. **Online Store → Themes → Customize**
3. **Vérifier qu'il n'y a plus d'extension "vton-widget"**
4. **Vérifier que le widget fonctionne toujours** (via Script Tags)

## Configuration actuelle (sans extensions)

L'app est configurée pour utiliser :

### 1. Script Tags (automatique)
- Installé automatiquement via le Dashboard
- Route : `/apps/tryon/widget-v2.js`
- Pas besoin d'extension de thème

### 2. App Proxy
- Routes publiques : `/apps/tryon/*`
- Permet au widget d'accéder aux APIs

### 3. Aucune extension de thème requise
- Le dossier `extensions/` est vide
- Aucune configuration dans `shopify.app.toml`

## Avantages de cette approche

✅ **Plus simple** : Pas besoin de gérer des extensions de thème  
✅ **Plus flexible** : Le widget peut être installé via Script Tags ou manuellement  
✅ **Moins de maintenance** : Pas de fichiers Liquid à maintenir  
✅ **Isolation complète** : Shadow DOM protège le thème

## Vérification finale

Après suppression de l'extension :

1. ✅ L'extension "vton-widget" n'apparaît plus dans Theme Customizer
2. ✅ Le widget fonctionne toujours (chargé via Script Tag)
3. ✅ Aucune erreur dans la console du navigateur
4. ✅ Le bouton "Try On" apparaît sur les pages produit

## Support

Si l'extension ne peut pas être supprimée via l'interface :

1. Contactez le support Shopify Partners
2. Ou utilisez l'API GraphQL pour la supprimer programmatiquement
3. Vérifiez que vous avez les permissions nécessaires


