# Guide de débogage du widget

## Problème : Le widget n'apparaît pas sur la page produit

### Corrections apportées

1. ✅ **Suppression de la condition Liquid** : Le widget se charge maintenant toujours (pas de `{% if template.name == 'product' %}`)
2. ✅ **Amélioration de la détection de page produit** : Vérifie à la fois Liquid et JavaScript
3. ✅ **Amélioration de l'extraction du Product ID** : Utilise `window.Shopify.products` (plus fiable)
4. ✅ **Logique de retry** : Réessaie d'extraire le Product ID après 1 seconde
5. ✅ **Injection même en cas d'erreur** : Le widget s'injecte même si le check de status échoue (pour debugging)
6. ✅ **Logs console détaillés** : Tous les steps sont loggés dans la console

## Étapes de débogage

### 1. Vérifier que l'extension est activée

1. **Shopify Admin** → Online Store → Themes
2. **Customize** votre thème actif
3. **App embeds** dans le menu de gauche
4. **Vérifier** que "Virtual Try-On Widget" est activé (toggle ON)

### 2. Vérifier la console du navigateur

1. **Ouvrir une page produit**
2. **Ouvrir DevTools** (F12)
3. **Onglet Console**
4. **Chercher les messages** commençant par `[VTON]`

Vous devriez voir :
```
[VTON Widget V2] Initializing...
[VTON] Page detection: { isProductPageLiquid: true/false, isProductPageJS: true/false }
[VTON] Product page detected, initializing widget
[VTON] Init started
[VTON] Extracting product ID...
[VTON] Product ID from Shopify.products: ...
[VTON] Checking status...
[VTON] Status check result: { enabled: true/false, ... }
[VTON] Injecting widget...
[VTON] Widget injected successfully
```

### 3. Vérifier les erreurs

Si vous voyez des erreurs dans la console :

#### Erreur : "Product ID not found"
- **Cause** : Le Product ID n'est pas extrait
- **Solution** : Vérifiez que `window.Shopify.products` existe dans la console
- **Test** : Tapez `window.Shopify.products` dans la console

#### Erreur : "Status check failed: 404"
- **Cause** : L'API `/apps/tryon/status` n'est pas accessible
- **Solution** : Vérifiez que l'App Proxy est configuré correctement dans `shopify.app.toml`

#### Erreur : "Try-on disabled for this product"
- **Cause** : Le try-on n'est pas activé pour ce produit
- **Solution** : 
  1. Admin → Products → Sélectionnez le produit
  2. Vérifiez que le toggle try-on est ON
  3. Admin → Dashboard → Vérifiez que "Activer l'app sur le store" est coché

### 4. Vérifier l'API Status

Testez directement l'API dans la console :

```javascript
const shop = window.Shopify?.shop || window.location.hostname;
const productId = Object.keys(window.Shopify?.products || {})[0];
const url = `${window.location.origin}/apps/tryon/status?shop=${shop}&product_id=${productId}`;

fetch(url)
  .then(r => r.json())
  .then(data => console.log('Status API response:', data))
  .catch(err => console.error('Status API error:', err));
```

### 5. Vérifier que le bouton Add to Cart est trouvé

Le widget cherche le bouton "Add to Cart" pour s'injecter à côté. Vérifiez dans la console :

```
[VTON] Injecting widget, retry count: 0
[VTON] Found Add to Cart button with selector: ...
[VTON] Widget injected successfully
```

Si vous voyez "Add to Cart button not found, retrying...", le widget ne trouve pas le bouton.

### 6. Vérifier le DOM

Dans la console, cherchez l'élément du widget :

```javascript
document.getElementById('vton-widget-root')
```

Si cet élément existe, le widget est injecté mais peut-être invisible.

### 7. Vérifier les styles

Le widget utilise Shadow DOM, donc les styles sont isolés. Vérifiez :

```javascript
const widget = document.getElementById('vton-widget-root');
if (widget && widget.shadowRoot) {
  console.log('Widget Shadow DOM:', widget.shadowRoot);
  const button = widget.shadowRoot.querySelector('.vton-button');
  console.log('Widget button:', button);
}
```

## Solutions courantes

### Le widget ne s'affiche pas du tout

1. **Vérifiez la console** pour les erreurs
2. **Vérifiez que l'extension est activée** dans Theme Customizer
3. **Rechargez la page** (Ctrl+Shift+R pour vider le cache)
4. **Vérifiez que le try-on est activé** pour le produit

### Le widget s'affiche mais le bouton ne fonctionne pas

1. **Vérifiez la console** pour les erreurs lors du clic
2. **Vérifiez que l'API `/apps/tryon/generate`** est accessible
3. **Vérifiez les permissions** de l'app (write_script_tags, etc.)

### Le widget apparaît mais dit "Try-on disabled"

1. **Admin → Products** → Activez le toggle try-on pour le produit
2. **Admin → Dashboard** → Vérifiez que "Activer l'app sur le store" est coché
3. **Vérifiez les quotas** (monthly quota, daily limit)

## Commandes utiles pour le debugging

```javascript
// Vérifier que le widget est initialisé
window.vtonWidget

// Vérifier le Product ID
window.vtonWidget?.productId

// Vérifier le shop
window.vtonWidget?.shop

// Vérifier si enabled
window.vtonWidget?.isEnabled

// Forcer l'injection du widget
window.vtonWidget?.injectWidget()
```

## Après le déploiement

1. **Déployez l'extension** : `shopify app deploy`
2. **Activez l'extension** dans Theme Customizer
3. **Testez sur une page produit**
4. **Vérifiez la console** pour les logs
5. **Partagez les logs** si le problème persiste

