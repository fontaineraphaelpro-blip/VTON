# Guide de débogage du widget

## Vérification que le script est chargé

### Étape 1 : Vérifier dans le navigateur

1. **Ouvrez une page produit** sur votre store
2. **Ouvrez les DevTools** (F12)
3. **Onglet Network** :
   - Filtrez par "widget"
   - Rechargez la page
   - Vérifiez si `widget-v2.js` est chargé
   - Status doit être 200 (vert)

4. **Onglet Console** :
   - Cherchez les messages `[VTON Widget V2]`
   - Vous devriez voir : `[VTON Widget V2] Script loaded`
   - Si vous ne voyez rien, le script n'est pas chargé

### Étape 2 : Vérifier les Script Tags installés

1. **Dans l'admin de l'app** → Dashboard
2. **Utilisez le bouton de nettoyage** pour voir les script tags
3. **Ou vérifiez manuellement** via Shopify Admin :
   - Settings → Apps and sales channels
   - Trouvez votre app → Manage
   - Vérifiez les Script Tags

### Étape 3 : Vérifier l'URL du script

Le script doit être accessible à :
```
https://votre-store.myshopify.com/apps/tryon/widget-v2.js
```

Testez cette URL directement dans le navigateur. Vous devriez voir du code JavaScript.

## Problèmes courants

### Le script n'est pas chargé

**Cause** : Le script tag n'est pas installé

**Solution** :
1. Allez dans Dashboard de l'app
2. Le script tag devrait s'installer automatiquement
3. Sinon, utilisez le bouton de nettoyage qui réinstalle aussi

### Le script se charge mais le widget n'apparaît pas

**Vérifiez dans la console** :
- `[VTON] Product ID not found` → Le product ID n'est pas extrait
- `[VTON] Try-on disabled for this product` → Le try-on est désactivé
- `[VTON] Max retries reached` → Le bouton Add to Cart n'est pas trouvé
- `[VTON] Failed to check status` → L'API status échoue

### Le script se charge mais il y a des erreurs

**Vérifiez** :
1. Les erreurs dans la console (onglet Console)
2. Les erreurs réseau (onglet Network, filtrez par "status" ou "tryon")
3. Les logs de debug dans `.cursor/debug.log`

## Commandes utiles

### Vérifier les script tags via GraphQL

```graphql
query {
  scriptTags(first: 50) {
    edges {
      node {
        id
        src
        displayScope
      }
    }
  }
}
```

### Installer manuellement le script tag

Si l'installation automatique ne fonctionne pas, vous pouvez l'installer manuellement via GraphQL :

```graphql
mutation scriptTagCreate($input: ScriptTagInput!) {
  scriptTagCreate(input: $input) {
    scriptTag {
      id
      src
    }
    userErrors {
      field
      message
    }
  }
}
```

Variables :
```json
{
  "input": {
    "src": "https://votre-store.myshopify.com/apps/tryon/widget-v2.js",
    "displayScope": "ONLINE_STORE"
  }
}
```

## Logs de debug

Les logs sont envoyés à :
- Console du navigateur (messages `[VTON]`)
- Fichier `.cursor/debug.log` (si le serveur de logs fonctionne)

Vérifiez les deux pour diagnostiquer les problèmes.

