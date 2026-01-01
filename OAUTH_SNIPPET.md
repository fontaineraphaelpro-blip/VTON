# Snippet OAuth Shopify Remix - Ouvrir dans la fenêtre principale

Ce snippet garantit que l'OAuth Shopify s'ouvre dans la fenêtre principale (hors iframe) pour éviter les blocages sur Firefox.

## Route OAuth Callback (`app/routes/auth.$.tsx`)

```typescript
import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = () => {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Si la page est dans une iframe (embedded=1), on force la sortie
  if (url.searchParams.get("embedded") === "1") {
    // Retirer le paramètre embedded et rediriger hors iframe
    url.searchParams.delete("embedded");
    return redirect(url.pathname + url.search, {
      headers: {
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    });
  }

  const { admin, session } = await authenticate.admin(request);

  // Redirect to app dashboard after successful authentication
  return redirect("/app");
};
```

## Route Login (`app/routes/auth.login/route.tsx`)

```typescript
import type { HeadersFunction } from "@remix-run/node";

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = () => {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
};

// ... reste du code ...
```

## Configuration Shopify (`app/shopify.server.ts`)

Assurez-vous que la configuration utilise `unstable_newEmbeddedAuthStrategy: true` :

```typescript
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true, // Important pour OAuth dans fenêtre principale
    removeRest: true,
    expiringOfflineAccessTokens: true,
  },
});
```

## Script Frontend (`app/root.tsx`)

Ajoutez ce script dans le `<head>` de votre `root.tsx` pour détecter et forcer la sortie de l'iframe côté client :

```typescript
<head>
  {/* ... autres meta tags ... */}
  {/* Script to detect iframe and force exit - required for Firefox OAuth */}
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function() {
          // Détecte si on est dans une iframe et force la sortie
          if (window.top !== window.self) {
            // Si on est dans une iframe, rediriger vers la même URL dans la fenêtre principale
            window.top.location.href = window.location.href;
          }
        })();
      `,
    }}
  />
</head>
```

## Pattern à appliquer dans toutes les routes admin/auth

Ajoutez cette logique dans **toutes** vos routes admin/auth (`app.tsx`, `app.dashboard.tsx`, `app._index.tsx`, etc.) :

```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Si la page est dans une iframe (embedded=1), on force la sortie
  if (url.searchParams.get("embedded") === "1") {
    // Retirer le paramètre embedded et rediriger hors iframe
    url.searchParams.delete("embedded");
    return redirect(url.pathname + url.search, {
      headers: {
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    });
  }

  // ... reste de votre code ...
};
```

## Notes importantes

1. **Headers X-Frame-Options et Content-Security-Policy** : Ces headers empêchent le chargement de la page dans un iframe, forçant l'ouverture dans la fenêtre principale.

2. **Détection `embedded=1`** : Shopify ajoute ce paramètre quand l'app est chargée dans une iframe. En le détectant et en redirigeant, on force l'ouverture dans la fenêtre principale.

3. **Script frontend** : Le script JavaScript détecte si la page est dans une iframe et force la redirection vers la fenêtre principale. C'est une sécurité supplémentaire.

4. **Firefox** : Firefox bloque par défaut les redirections OAuth dans les iframes pour des raisons de sécurité. Ces mécanismes résolvent ce problème.

5. **Redirection après authentification** : Après une authentification réussie, redirigez vers `/app` ou votre route principale.

6. **Session Storage** : Assurez-vous que `PrismaSessionStorage` est correctement configuré avec toutes les colonnes requises dans la table `Session`.

7. **Routes à modifier** : Appliquez cette logique dans toutes les routes qui nécessitent l'authentification admin :
   - `app/routes/auth.$.tsx`
   - `app/routes/auth.login/route.tsx`
   - `app/routes/app.tsx`
   - `app/routes/app.dashboard.tsx`
   - `app/routes/app._index.tsx`
   - Toute autre route admin

