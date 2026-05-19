# Virtual Try-On — Shopify App

Application Shopify embarquée qui permet aux clients d’essayer virtuellement les produits (photo client + image vêtement) via **Replicate**, avec admin analytics, abonnements et extension thème.

**Stack :** Remix · Shopify App Remix · Polaris · PostgreSQL · Prisma (sessions) · Extension thème `vton-widget`

---

## Fonctionnalités

### Storefront (widget)

- Funnel try-on en **3 étapes** : upload photo → génération → résultat + ajout au panier
- Génération **asynchrone** (`job_id` + polling) pour éviter les timeouts
- **Retry gratuit** si l’IA échoue : pas de crédit débité tant que Replicate n’a pas réussi (retry auto + bouton « Try again — free »)
- **Partage social** : WhatsApp, copier le lien image, partage natif (mobile)
- Sélecteur de variante sur l’écran résultat
- Placement configurable du bouton (thème + sélecteur CSS custom)
- Mode debug : `?vton_debug` sur une page produit

### Admin

- **Dashboard** : stats 30 j, graphique ligne, top produits, quota mensuel
- **Onboarding** (3 étapes) : embed thème → premier try-on → photo garment IA
- **Alertes crédits** globales : avertissement à **80 %** du quota / critique à **0 crédit**
- **Products** : pagination + recherche, activer/désactiver le try-on par produit, **photo garment IA** (flat lay) sans polluer la galerie produit
- **Widget** : texte, couleurs, limites journalières / par client, **A/B test** (try-on vs contrôle)
- **Credits** : plans Shopify Billing, funnel conversion simplifié
- **History**, **Privacy**, **Terms**, **Support**

### Technique

- App Proxy `/apps/tryon/*` avec vérification HMAC
- Upload garment vers **Shopify Files** (`write_files`) — invisible dans la galerie produit
- Webhooks : `app/uninstalled`, `app/scopes_update`, GDPR
- Logs try-on, rate limits, réglages par produit (`product_settings`)

---

## Prérequis

- Node.js **18.20+**, **20.10+** ou **21+**
- Compte [Shopify Partners](https://partners.shopify.com)
- PostgreSQL
- Token [Replicate](https://replicate.com)

---

## Installation locale

```bash
cd VTON-main   # ou le dossier racine du clone
npm install
```

### Variables d’environnement (`.env`)

```env
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=write_products,write_script_tags,write_files
SHOPIFY_APP_URL=https://your-app-url.example.com
DATABASE_URL=postgresql://user:pass@host:5432/db
REPLICATE_API_TOKEN=

# Optionnel
REPLICATE_MODEL=bytedance/seedream-4.5
```

> Après ajout de `write_files`, les boutiques existantes doivent **ré-approuver** l’app (nouveau scope).

### Base de données

```bash
npm run setup    # prisma generate + migrate deploy (sessions)
npm run dev      # Shopify CLI + Remix
```

Les tables métier (`shops`, `tryon_logs`, `product_settings`, `ab_events`, etc.) sont créées au démarrage via `ensureTables()` dans `app/lib/db-init.server.ts`.

---

## Commandes

| Commande | Description |
|----------|-------------|
| `npm run dev` | Dev avec Shopify CLI |
| `npm run build` | Build production Remix |
| `npm start` | Serveur production (`remix-serve`) |
| `npm run setup` | Prisma generate + migrations |
| `npm run deploy` | Strip BOM widget + `shopify app deploy` |
| `shopify app deploy` | Publier config + extension thème |

---

## Structure du projet

```
VTON-main/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx           # Dashboard + onboarding
│   │   ├── app.products.tsx         # Catalogue (pagination, garment)
│   │   ├── app.credits.tsx          # Plans & billing
│   │   ├── app.widget.tsx           # Réglages widget + A/B
│   │   ├── app.history.tsx
│   │   ├── apps.tryon.generate.tsx  # POST génération IA
│   │   ├── apps.tryon.job.$jobId.tsx
│   │   ├── apps.tryon.status.tsx
│   │   ├── apps.tryon.atc.tsx
│   │   ├── apps.tryon.ab-event.tsx
│   │   └── webhooks.*
│   ├── components/
│   │   ├── OnboardingGuide.tsx
│   │   └── CreditsAlertBanner.tsx
│   ├── lib/
│   │   ├── services/replicate.service.ts
│   │   ├── services/db.service.ts
│   │   ├── shopify-garment-file-upload.server.ts
│   │   ├── shopify-products.server.ts
│   │   ├── tryon-billing.server.ts
│   │   ├── credits-alert.ts
│   │   ├── onboarding.server.ts
│   │   └── ab-test.server.ts
│   └── shopify.server.ts
├── extensions/vton-widget/          # Bloc thème + vton-widget.js
├── prisma/                          # Sessions OAuth uniquement
├── shopify.app.toml
└── DEPLOY.md                        # Guide déploiement détaillé
```

---

## Crédits & facturation

- **1 crédit = 1 try-on réussi** (génération Replicate terminée avec succès)
- **Échec IA** : aucun crédit consommé ; le client peut réessayer gratuitement
- Quotas mensuels selon le plan (Free Discovery, Starter, Pro, Studio / Enterprise)
- Compteurs d’usage mensuel / journalier basés sur les logs `success = true`

---

## API (App Proxy)

Préfixe storefront : `https://{shop}/apps/tryon/...` → proxy vers l’app.

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/apps/tryon/status` | État widget / produit / A/B / URL garment |
| `POST` | `/apps/tryon/generate` | Lance une génération (retourne `job_id`) |
| `GET` | `/apps/tryon/job/:id` | Statut pending / completed / failed |
| `POST` | `/apps/tryon/atc` | Suivi add-to-cart post try-on |
| `POST` | `/apps/tryon/ab-event` | Impressions / try-on / ATC par bucket A/B |

Routes racine (`/generate`, `/status`, `/job/:id`, `/atc`) : alias pour le proxy Shopify qui retire le préfixe `/apps/tryon`.

---

## Déploiement

Voir **[DEPLOY.md](./DEPLOY.md)** pour le détail.

Résumé :

1. **Railway** (ou autre) : push `main`, variables d’env, `DATABASE_URL`, `SCOPES` à jour
2. **`npm run deploy`** ou `shopify app deploy` : extension + scopes Partners
3. **Thème** : Personnaliser → Intégrations → activer **Virtual Try-On Widget**
4. **App proxy** : `prefix=apps`, `subpath=tryon` (déjà dans `shopify.app.toml`)

URL prod actuelle (config) : `https://vton-production-890a.up.railway.app`

---

## Scopes Shopify

```
write_products, write_script_tags, write_files
```

- `write_products` — réglages produits
- `write_script_tags` — installation script widget (legacy / boot)
- `write_files` — photos garment IA dans Fichiers Shopify (hors galerie produit)

---

## Dépannage

| Problème | Piste |
|----------|--------|
| Widget absent | Extension activée dans le thème ; `?vton_debug` ; sélecteur CSS dans les réglages widget |
| 403 generate | App proxy + HMAC ; URL app dans Partners |
| Upload garment échoue | Scope `write_files` + réinstallation app sur la boutique |
| Plus de crédits | Page Credits / bannière admin ; upgrade plan |
| Build | `npm run setup` puis `npm run build` |

---

## Documentation

- [Shopify App Remix](https://shopify.dev/docs/apps/build)
- [App proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies)
- [Replicate API](https://replicate.com/docs)
- [Remix](https://remix.run/docs)

---

## Support

**Email :** fontaineraphaelpro@gmail.com

---

## Licence

Projet privé — tous droits réservés.
