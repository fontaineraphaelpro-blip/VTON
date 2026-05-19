# Déploiement VTON (backend + extension widget)

## 1. Backend (Railway)

Le push sur `main` déclenche en général un redeploy automatique.

Vérifier : https://vton-production-890a.up.railway.app

## 2. Extension thème (widget storefront)

Depuis le dossier du projet :

```bash
cd VTON-main
npm install
shopify auth login
shopify app deploy --force
```

Ou en une commande :

```bash
npm run deploy
```

> La première fois, le CLI ouvre un lien pour te connecter à Shopify Partners.

## 3. Activer le widget dans chaque thème

Après `shopify app deploy` :

1. **Boutique en ligne** → **Thèmes** → **Personnaliser**
2. **Intégrations d’applications** (icône puzzle)
3. Activer **Virtual Try-On Widget**
4. **Enregistrer**

### Thèmes très personnalisés

Dans les réglages de l’embed, renseigner **Custom button placement** avec le sélecteur du bloc « Ajouter au panier », par exemple :

- `.product-form__buttons`
- `#ProductSubmit`
- `form[action*="/cart/add"]`

## 4. Vérifier sur une page produit

1. Ouvrir une fiche produit en navigation privée
2. Le bouton try-on doit apparaître près du panier (ou en bas à droite en mode secours)
3. Debug : ajouter `?vton_debug` à l’URL pour voir les logs console

## 5. App Proxy (obligatoire)

Dans **Partners** → ton app → **Configuration** → **App proxy** :

- Subpath : `tryon`
- Prefix : `apps`
- URL : `https://vton-production-890a.up.railway.app`

(Cela doit correspondre à `shopify.app.toml`.)
