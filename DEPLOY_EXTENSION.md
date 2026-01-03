# Guide de déploiement de l'extension

## Méthode 1 : Déploiement en production (Recommandé)

### Étape 1 : Déployer l'app avec l'extension

```bash
cd vton-shopify-remix
shopify app deploy
```

Cette commande va :
- ✅ Déployer votre app Remix
- ✅ Déployer l'extension Theme App Extension
- ✅ Mettre à jour l'app sur Shopify

### Étape 2 : Activer l'extension dans le thème

Une fois déployé :

1. **Aller dans Shopify Admin** → Online Store → Themes
2. **Cliquer sur "Customize"** sur votre thème actif
3. **Dans le menu de gauche**, chercher **"App embeds"** (ou "Intégrations d'apps")
4. **Trouver "Virtual Try-On Widget"** dans la liste
5. **Activer le toggle** pour activer l'extension
6. **Sauvegarder** les modifications du thème

### Étape 3 : Vérifier sur une page produit

1. **Aller sur une page produit** de votre store
2. **Vérifier que le bouton "Try On"** apparaît près du bouton "Add to Cart"
3. **Tester le widget** en cliquant dessus

## Méthode 2 : Développement local (pour tester)

Si vous voulez tester en local avant de déployer :

```bash
cd vton-shopify-remix
shopify app dev
```

Cette commande va :
- ✅ Démarrer un tunnel de développement
- ✅ Permettre de tester l'extension en temps réel
- ✅ Recharger automatiquement les changements

## Vérification après déploiement

### Vérifier que l'extension est déployée

```bash
shopify app info
```

Vous devriez voir :
```
theme_app_extension
📂 virtual-try-on-widget  extensions/vton-widget
```

### Vérifier dans Shopify Partner Dashboard

1. Aller sur [partners.shopify.com](https://partners.shopify.com)
2. Sélectionner votre app "Try-On StyleLab"
3. Aller dans "Extensions"
4. Vérifier que "Virtual Try-On Widget" est listé

## Dépannage

### L'extension n'apparaît pas dans Theme Customizer

**Solution 1** : Vérifier que l'extension est bien déployée
```bash
shopify app deploy
```

**Solution 2** : Vérifier que l'app est installée sur le store
- Aller dans Shopify Admin → Apps
- Vérifier que "Try-On StyleLab" est installé

**Solution 3** : Recharger Theme Customizer
- Fermer et rouvrir Theme Customizer
- Vider le cache du navigateur (Ctrl+Shift+R)

### Erreur lors du déploiement

Si vous avez une erreur, vérifiez :

1. **Vous êtes connecté** : `shopify auth status`
2. **Vous avez les permissions** : L'app doit avoir les scopes nécessaires
3. **L'extension est valide** : `shopify app generate extension` pour vérifier la structure

### Le widget n'apparaît pas sur la page produit

1. **Vérifier que l'extension est activée** dans Theme Customizer
2. **Vérifier la console** du navigateur (F12) pour les erreurs
3. **Vérifier que le try-on est activé** pour le produit dans l'admin de l'app
4. **Vérifier que l'app est activée** dans Dashboard → "Activer l'app sur le store"

## Commandes utiles

```bash
# Vérifier l'état de l'app
shopify app info

# Déployer l'app et l'extension
shopify app deploy

# Développement local
shopify app dev

# Vérifier l'authentification
shopify auth status

# Voir les logs
shopify app logs
```

## Prochaines étapes après déploiement

1. ✅ **Déployer** : `shopify app deploy`
2. ✅ **Activer** l'extension dans Theme Customizer
3. ✅ **Tester** sur une page produit
4. ✅ **Supprimer les Script Tags** (optionnel, via Dashboard)
5. ✅ **Vérifier** que tout fonctionne

