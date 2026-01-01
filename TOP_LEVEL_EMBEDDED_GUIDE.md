# Guide: Top-Level vs Embedded Routes dans Shopify Remix

Ce guide explique comment gérer les routes top-level (OAuth, Admin) vs embedded (UI de l'app) dans votre application Shopify Remix.

## Architecture

### Routes Top-Level (DOIVENT s'ouvrir hors iframe)
- `/auth/*` - Toutes les routes OAuth
- `/auth/login` - Page de login
- `/auth/callback` - Callback OAuth
- Toute route qui nécessite l'authentification admin initiale

### Routes Embedded (PEUVENT rester dans iframe)
- `/app/*` - Toutes les routes de l'UI de l'app
- `/app/dashboard` - Dashboard
- `/app/additional` - Pages additionnelles

## Fichiers créés

### 1. `app/lib/top-level.server.ts`
Utilitaires serveur pour détecter et forcer les routes top-level.

**Fonctions principales :**
- `isTopLevelRoute(pathname)` - Vérifie si une route doit être top-level
- `isInIframe(request)` - Détecte si la requête est dans une iframe
- `ensureTopLevel(request)` - Force une route à être top-level
- `ensureTopLevelLoader(request)` - Helper pour les loaders

### 2. `app/lib/top-level.client.tsx`
Utilitaires client pour détecter et forcer la sortie d'iframe.

**Composants et hooks :**
- `useTopLevelRedirect()` - Hook React pour forcer top-level
- `TopLevelRedirect` - Composant React pour forcer top-level

## Utilisation

### Dans les routes OAuth (top-level)

```typescript
// app/routes/auth.$.tsx
import { ensureTopLevelLoader } from "../lib/top-level.server";
import { TopLevelRedirect } from "../lib/top-level.client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Force top-level si dans iframe
  const topLevelRedirect = ensureTopLevelLoader(request);
  if (topLevelRedirect) {
    return topLevelRedirect;
  }

  // ... reste du code d'authentification
};

export default function AuthCallback() {
  return <TopLevelRedirect />;
}
```

### Dans les routes App (embedded)

```typescript
// app/routes/app.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Pas besoin de forcer top-level - les routes app peuvent être embedded
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  
  // isEmbeddedApp permet à l'app de fonctionner dans l'iframe Shopify
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* ... */}
    </AppProvider>
  );
}
```

## Comment ça fonctionne

### 1. Détection serveur (`entry.server.tsx`)
- Détecte les routes top-level (`/auth/*`)
- Si `embedded=1` est présent, retourne une page HTML simple qui force la sortie
- Applique les headers `X-Frame-Options: DENY` sur les routes top-level

### 2. Détection client (`root.tsx`)
- Script inline dans le `<head>` qui s'exécute avant React
- Détecte si on est sur une route top-level et dans une iframe
- Force la redirection de la fenêtre parente

### 3. Composants React (`TopLevelRedirect`)
- Hook `useTopLevelRedirect()` dans les composants
- Force la sortie d'iframe côté client si nécessaire

## Headers HTTP

Les routes top-level incluent automatiquement :
- `X-Frame-Options: DENY` - Empêche le chargement dans une iframe
- `Content-Security-Policy: frame-ancestors 'none'` - Empêche le chargement dans une iframe

Les routes embedded n'incluent PAS ces headers, permettant le chargement dans l'iframe Shopify.

## Sessions Prisma

Les sessions Prisma continuent de fonctionner normalement car :
- L'authentification se fait toujours via `authenticate.admin(request)`
- `PrismaSessionStorage` stocke les sessions indépendamment du contexte (iframe ou top-level)
- Les tokens OAuth sont échangés en top-level, puis l'app peut fonctionner en embedded

## Tests

1. **OAuth en top-level** : Accéder à `/auth/login` devrait s'ouvrir dans une nouvelle fenêtre
2. **App en embedded** : Accéder à `/app/dashboard` devrait rester dans l'iframe Shopify
3. **Firefox** : L'OAuth devrait fonctionner sans erreur de blocage iframe

## Dépannage

### Firefox bloque toujours
- Vérifier que les headers `X-Frame-Options` sont bien présents sur les routes `/auth/*`
- Vérifier que le script inline dans `root.tsx` s'exécute
- Vérifier que `ensureTopLevelLoader` est appelé dans tous les loaders OAuth

### L'app ne fonctionne pas en embedded
- Vérifier que `isEmbeddedApp={true}` est présent dans `AppProvider`
- Vérifier que les routes `/app/*` n'ont PAS les headers anti-iframe
- Vérifier que `authenticate.admin()` fonctionne correctement

