# Fix: Problème de Checkout Shopify pour l'achat de crédits

## ✅ Corrections apportées

1. **Gestion des erreurs améliorée**
   - Logs détaillés de toutes les réponses GraphQL
   - Messages d'erreur plus explicites
   - Vérification de tous les cas d'erreur possibles

2. **Format des prix corrigé**
   - `originalUnitPrice` utilise maintenant `.toFixed(2)` au lieu de `.toString()`
   - Format correct pour l'API Shopify

3. **Gestion du customer email**
   - Customer email optionnel (ne bloque plus si absent)
   - Utilise `session.email` si disponible

4. **Permissions Shopify**
   - Ajout du scope `write_draft_orders` dans `shopify.app.toml`
   - **IMPORTANT:** Vous devez aussi mettre à jour votre variable d'environnement `SCOPES`

## 🔧 Actions requises

### 1. Mettre à jour la variable d'environnement SCOPES

Dans votre fichier `.env` ou dans Railway (Settings > Variables), ajoutez `write_draft_orders` :

```env
SCOPES=read_orders,write_orders,read_products,write_products,write_draft_orders
```

### 2. Ré-authentifier l'application

Après avoir ajouté le nouveau scope, vous devez ré-authentifier l'application :

1. **Option 1 - Via Shopify Partners:**
   - Aller dans Shopify Partners > Votre App > Configuration
   - Mettre à jour les scopes pour inclure `write_draft_orders`
   - Réinstaller l'app sur votre store de test

2. **Option 2 - Via CLI:**
   ```bash
   shopify app dev
   ```
   - Cela va détecter le nouveau scope et demander une ré-authentification

### 3. Vérifier les logs

Si le problème persiste, vérifiez les logs de l'application. Les nouvelles erreurs incluront :
- Les erreurs GraphQL détaillées
- Les réponses complètes de l'API Shopify
- Les messages d'erreur spécifiques

## 🐛 Dépannage

### Erreur: "Failed to create draft order"
- **Cause:** Permissions manquantes
- **Solution:** Vérifier que `write_draft_orders` est dans les scopes et ré-authentifier

### Erreur: "Draft order created but no checkout URL available"
- **Cause:** Le draft order est créé mais sans `invoiceUrl`
- **Solution:** Vérifier les logs pour voir la réponse complète de Shopify

### Erreur: "Failed to create checkout: [message d'erreur]"
- **Cause:** Erreur spécifique de l'API Shopify
- **Solution:** Vérifier les logs pour le message d'erreur complet

## 📝 Notes

- Les logs sont maintenant plus détaillés pour faciliter le debugging
- Le customer email est optionnel (ne bloque plus la création)
- Le format des prix est maintenant correct (2 décimales)

## ✅ Après correction

Une fois les corrections appliquées et l'app ré-authentifiée :
1. Les boutons d'achat de crédits devraient rediriger vers le checkout Shopify
2. Les erreurs seront plus explicites si quelque chose ne fonctionne pas
3. Les logs permettront de diagnostiquer rapidement les problèmes



