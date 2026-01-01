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

## Notes importantes

1. **Headers X-Frame-Options et Content-Security-Policy** : Ces headers empêchent le chargement de la page dans un iframe, forçant l'ouverture dans la fenêtre principale.

2. **Firefox** : Firefox bloque par défaut les redirections OAuth dans les iframes pour des raisons de sécurité. Ces headers résolvent ce problème.

3. **Redirection après authentification** : Après une authentification réussie, redirigez vers `/app` ou votre route principale.

4. **Session Storage** : Assurez-vous que `PrismaSessionStorage` est correctement configuré avec toutes les colonnes requises dans la table `Session`.

