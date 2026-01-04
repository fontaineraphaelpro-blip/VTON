# Guide d'installation de la Theme App Extension

## Qu'est-ce qu'une Theme App Extension ?

Une Theme App Extension est une méthode plus fiable que les Script Tags pour injecter du code dans les thèmes Shopify. Elle permet au marchand d'activer/désactiver le widget directement depuis le Theme Customizer.

## Installation

### Étape 1 : Déployer l'extension

```bash
cd vton-shopify-remix
shopify app deploy
```

Cela déploiera l'extension avec votre app.

### Étape 2 : Activer l'extension dans le thème

1. **Aller dans Shopify Admin** → Online Store → Themes
2. **Cliquer sur "Customize"** sur votre thème actif
3. **Chercher "App embeds"** dans le menu de gauche
4. **Trouver "Virtual Try-On Widget"** dans la liste
5. **Activer le toggle** pour activer l'extension

### Étape 3 : Vérifier sur une page produit

1. **Aller sur une page produit**
2. **Vérifier que le bouton "Try On"** apparaît près du bouton "Add to Cart"
3. **Tester le widget** en cliquant sur le bouton

## Avantages de la Theme App Extension

✅ **Plus fiable** : Intégration native dans Shopify  
✅ **Contrôle marchand** : Le marchand peut activer/désactiver depuis le Theme Customizer  
✅ **Pas de Script Tags** : Plus besoin de gérer les Script Tags manuellement  
✅ **Meilleure performance** : Chargé au bon moment dans le cycle de vie de la page  
✅ **Compatible tous thèmes** : Fonctionne avec tous les thèmes Shopify  

## Structure de l'extension

```
extensions/vton-widget/
├── shopify.extension.toml    # Configuration de l'extension
└── src/
    └── block.liquid          # Code du widget (injecté sur les pages produit)
```

## Désactiver l'ancien système (Script Tags)

Une fois l'extension activée et testée :

1. **Aller dans Dashboard** de l'app
2. **Cliquer sur "Supprimer les anciens widgets et scripts"**
3. Cela supprimera les Script Tags (l'extension continuera de fonctionner)

## Dépannage

### L'extension n'apparaît pas dans Theme Customizer

- Vérifiez que l'extension est bien déployée : `shopify app info`
- Vérifiez que l'app est installée sur le store
- Rechargez la page Theme Customizer

### Le widget n'apparaît pas sur la page produit

1. **Vérifiez que l'extension est activée** dans Theme Customizer
2. **Vérifiez la console** du navigateur pour les erreurs
3. **Vérifiez que le try-on est activé** pour le produit dans l'admin de l'app
4. **Vérifiez que l'app est activée** dans Dashboard → "Activer l'app sur le store"

### Erreurs dans la console

- Ouvrez les DevTools (F12)
- Onglet Console
- Cherchez les messages `[VTON]`
- Les logs indiqueront où le problème se situe

## Migration depuis Script Tags

Si vous aviez déjà des Script Tags installés :

1. **Activez la Theme App Extension** (voir ci-dessus)
2. **Testez que le widget fonctionne** avec l'extension
3. **Supprimez les Script Tags** via le Dashboard
4. **Vérifiez que le widget fonctionne toujours** (il devrait, car l'extension est active)

## Support

Si vous rencontrez des problèmes :

1. Vérifiez les logs dans la console du navigateur
2. Vérifiez que l'extension est bien activée dans Theme Customizer
3. Vérifiez que l'app a les permissions nécessaires
4. Contactez le support si le problème persiste


