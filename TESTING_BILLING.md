# Guide de Test de Facturation Shopify

## Comment tester la facturation en développement

### Option 1: Mode Test Shopify (Recommandé)

Shopify permet de tester la facturation avec le paramètre `test: true` dans la mutation GraphQL. Votre code utilise déjà cette fonctionnalité :

```typescript
test: process.env.NODE_ENV !== "production"
```

**Comment ça fonctionne :**
- En développement (`NODE_ENV !== "production"`), `test: true` est automatiquement activé
- Shopify crée un abonnement de test qui n'est **pas facturé**
- Vous pouvez tester tout le flux sans frais réels
- L'abonnement apparaît dans l'admin Shopify comme "Test"

### Option 2: Store de Développement Shopify

1. **Créer un store de développement** :
   - Allez sur https://partners.shopify.com
   - Créez un nouveau store de développement
   - Les stores de développement permettent de tester la facturation gratuitement

2. **Installer l'app sur le store de développement** :
   - Utilisez `npm run dev` pour lancer l'app en mode développement
   - Installez l'app sur votre store de développement
   - Testez l'achat d'un plan

### Option 3: Activation Directe (Déjà implémenté)

Votre code a déjà une fonctionnalité pour le développement :

```typescript
if (process.env.NODE_ENV !== "production") {
  // Activation directe sans facturation
  await upsertShop(shop, { monthlyQuota: monthlyQuota });
  return json({ success: true, ... });
}
```

**Cette option :**
- ✅ Fonctionne uniquement en développement
- ✅ Bypasse complètement Shopify Billing
- ✅ Permet de tester rapidement les fonctionnalités
- ⚠️ Ne teste PAS le vrai flux de facturation

## Étapes pour tester le flux complet

### 1. Tester avec un Store de Développement

```bash
# 1. Lancer l'app en mode développement
npm run dev

# 2. Installer l'app sur un store de développement Shopify
# 3. Aller dans l'app → Credits
# 4. Sélectionner un plan payant (Starter, Pro, ou Enterprise)
# 5. Cliquer sur "Activate Plan"
```

**Ce qui devrait se passer :**
- Si `NODE_ENV !== "production"` : Activation directe (bypass)
- Si `NODE_ENV === "production"` : Redirection vers Shopify pour confirmer l'abonnement

### 2. Tester le Flux de Facturation Réel (Production)

Pour tester le vrai flux de facturation :

1. **Définir `NODE_ENV=production`** (ou ne pas le définir et utiliser un store de production)
2. **Installer l'app sur un store de test Shopify** (pas un store de développement)
3. **Essayer d'acheter un plan**

**Note importante :**
- Les stores de développement Shopify ne peuvent pas être facturés
- Pour tester la facturation réelle, vous devez utiliser un store de test Shopify (créé via Partners)
- Les stores de test peuvent être facturés mais vous pouvez les supprimer après

### 3. Vérifier les Abonnements

Après avoir créé un abonnement (test ou réel), vérifiez :

1. **Dans l'admin Shopify** :
   - Settings → Apps and sales channels → Your app
   - Vérifiez que l'abonnement apparaît

2. **Dans votre base de données** :
   - Vérifiez que `monthly_quota` est mis à jour dans la table `shops`

3. **Dans l'app** :
   - La page Credits devrait afficher le plan actif
   - Le quota mensuel devrait être visible

## Dépannage

### Erreur: "Managed Pricing App"

Si vous voyez cette erreur :
```
This app uses managed pricing and cannot create subscriptions via the Billing API
```

**C'est normal si :**
- Votre app est configurée comme "Managed Pricing App" dans Shopify Partners
- Shopify gère automatiquement la facturation via l'App Store
- Vous n'avez pas besoin de créer manuellement les abonnements

**Solution :**
- Si vous voulez gérer la facturation vous-même, désactivez "Managed Pricing" dans Shopify Partners
- Si vous voulez que Shopify gère la facturation, laissez "Managed Pricing" activé et supprimez le code de création d'abonnement

### Erreur: "Test store cannot be billed"

**C'est normal :**
- Les stores de développement ne peuvent pas être facturés
- Utilisez `test: true` ou l'activation directe en développement

### Comment savoir si c'est un store de test ?

Vérifiez le domaine du store :
- Store de développement : `dev-store.myshopify.com` ou créé via Partners
- Store de test : `test-store.myshopify.com` ou créé via Partners (peut être facturé)
- Store de production : `votre-boutique.myshopify.com`

## Recommandations

1. **Pour le développement local** :
   - Utilisez `NODE_ENV=development` ou ne définissez pas `NODE_ENV`
   - L'activation directe fonctionnera automatiquement

2. **Pour tester le flux réel** :
   - Créez un store de test via Shopify Partners
   - Définissez `NODE_ENV=production` (ou déployez sur Railway)
   - Testez l'achat d'un plan

3. **Pour la soumission à l'App Store** :
   - Shopify testera avec un store de test
   - Assurez-vous que le flux fonctionne avec `test: true`
   - Documentez comment tester la facturation

## Code Actuel

Votre code gère déjà ces cas :

```typescript
// 1. Plan gratuit → Activation directe
if (pack.price === 0) {
  await upsertShop(shop, { monthlyQuota: monthlyQuota });
  return json({ success: true, ... });
}

// 2. Mode développement → Activation directe (bypass)
if (process.env.NODE_ENV !== "production") {
  await upsertShop(shop, { monthlyQuota: monthlyQuota });
  return json({ success: true, ... });
}

// 3. Mode production → Création d'abonnement Shopify
const response = await admin.graphql(
  `mutation appSubscriptionCreate(...) {
    ...
    test: process.env.NODE_ENV !== "production"  // Test mode en dev
  }`
);
```

**C'est parfait pour le développement !** ✅

