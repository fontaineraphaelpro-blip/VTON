# Guide pour supprimer l'ancien widget

## Méthodes pour supprimer l'ancien widget

### Méthode 1: Via l'interface Admin (Recommandé)

1. **Aller dans le Dashboard de l'app**
   - Ouvrez votre app Shopify
   - Allez dans la section Dashboard

2. **Utiliser le bouton de nettoyage**
   - Dans la section "Réglages & Sécurité"
   - Cliquez sur le bouton "Supprimer les anciens widgets et scripts"
   - Cela supprimera automatiquement tous les anciens script tags `widget.js`

### Méthode 2: Via Shopify Admin (Script Tags)

1. **Aller dans Settings → Apps and sales channels**
2. **Trouver votre app** dans la liste
3. **Cliquer sur "Manage"** ou "Configurer"
4. **Vérifier les Script Tags installés**
5. **Supprimer manuellement** les script tags contenant `/apps/tryon/widget.js` (mais garder `widget-v2.js`)

### Méthode 3: Via l'API GraphQL (Développeurs)

Si vous avez accès à l'API GraphQL, vous pouvez supprimer les anciens script tags :

```graphql
mutation scriptTagDelete($id: ID!) {
  scriptTagDelete(id: $id) {
    deletedScriptTagId
    userErrors {
      field
      message
    }
  }
}
```

### Méthode 4: Supprimer l'extension de thème

Si vous avez installé le widget via une **Theme Extension** (comme visible dans l'image avec le handle "vton-widget"):

1. **Aller dans Online Store → Themes**
2. **Cliquer sur "Customize"** sur votre thème actif
3. **Aller dans Theme settings** ou chercher les extensions
4. **Trouver l'extension "vton-widget"**
5. **La désactiver ou la supprimer**

### Méthode 5: Via le code du thème

Si le widget a été ajouté directement dans le code Liquid du thème:

1. **Aller dans Online Store → Themes → Actions → Edit code**
2. **Chercher** dans les fichiers Liquid (souvent `product.liquid`, `product-form.liquid`, ou `theme.liquid`)
3. **Rechercher** la ligne: `<script src="{{ shop.url }}/apps/tryon/widget.js" defer></script>`
4. **La supprimer** ou la remplacer par: `<script src="{{ shop.url }}/apps/tryon/widget-v2.js" defer></script>`

## Vérification

Après suppression, vérifiez que:

1. ✅ L'ancien script `widget.js` n'est plus chargé (onglet Network des DevTools)
2. ✅ Le nouveau script `widget-v2.js` est chargé à la place
3. ✅ Aucun bouton dupliqué n'apparaît sur la page produit
4. ✅ Le widget fonctionne correctement avec Shadow DOM

## Note importante

Le code a été mis à jour pour:
- ✅ Installer automatiquement `widget-v2.js` au lieu de `widget.js`
- ✅ Supprimer automatiquement les anciens script tags `widget.js` lors du nettoyage
- ✅ Garder uniquement `widget-v2.js` lors des nouvelles installations

Le nettoyage automatique se fait via le bouton dans le Dashboard.


