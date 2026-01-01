# Vérification : Top-Level vs Embedded Routes

## ✅ Vérifications effectuées

### 1. Routes UI de l'app (PEUVENT être embedded) ✅

**Routes vérifiées :**
- `/app` - Layout principal
- `/app/dashboard` - Dashboard
- `/app/_index` - Index
- `/app/additional` - Page additionnelle

**Configuration :**
- ✅ `isEmbeddedApp={true}` dans `AppProvider` (app/routes/app.tsx)
- ✅ Aucun header `X-Frame-Options: DENY` sur ces routes
- ✅ Aucun header `Content-Security-Policy: frame-ancestors 'none'` sur ces routes
- ✅ `boundary.headers()` utilisé (ne bloque pas l'iframe)
- ✅ Pas de redirection top-level dans les loaders

**Résultat :** Ces routes peuvent rester embedded dans l'iframe Shopify Admin.

### 2. Routes OAuth/Admin (DOIVENT être top-level) ✅

**Routes vérifiées :**
- `/auth` - Callback OAuth
- `/auth/login` - Page de login
- Toutes les routes `/auth/*`

**Configuration :**
- ✅ Headers `X-Frame-Options: DENY` dans les routes auth
- ✅ Headers `Content-Security-Policy: frame-ancestors 'none'` dans les routes auth
- ✅ `ensureTopLevelLoader()` appelé dans tous les loaders auth
- ✅ `TopLevelRedirect` composant utilisé dans les composants auth
- ✅ Script inline dans `root.tsx` qui détecte `/auth/*` et force la sortie
- ✅ Interception dans `entry.server.tsx` qui retourne page HTML de redirection si `embedded=1`

**Mécanisme de redirection :**
1. **Serveur (`entry.server.tsx`)** : Si `embedded=1` sur `/auth/*`, retourne page HTML avec `window.top.location.href`
2. **Client inline (`root.tsx`)** : Script dans `<head>` qui détecte `/auth/*` dans iframe et utilise `window.top.location.href`
3. **Client React (`TopLevelRedirect`)** : Hook `useTopLevelRedirect()` qui utilise `window.top.location.href`

**Résultat :** Ces routes s'ouvrent toujours en top-level, jamais dans un iframe.

### 3. Aucun code n'affiche admin.shopify.com dans un iframe ✅

**Vérifications :**
- ✅ Aucune référence à `admin.shopify.com` dans le code
- ✅ Les liens `shopify:admin/products/...` sont des liens App Bridge (correct, pas des iframes)
- ✅ Toutes les redirections OAuth utilisent les routes de l'app (`/auth`), pas `admin.shopify.com`

### 4. Mécanisme de redirection automatique ✅

**Implémentation :**
- ✅ `window.top.location.href` utilisé partout (méthode standard)
- ✅ Fallback avec `window.open()` si bloqué
- ✅ Script inline s'exécute avant React
- ✅ Interception serveur avant le rendu Remix

## Structure des fichiers

```
app/
├── lib/
│   ├── top-level.server.ts      # Utilitaires serveur
│   └── top-level.client.tsx     # Utilitaires client
├── routes/
│   ├── auth.$.tsx               # ✅ Top-level (OAuth callback)
│   ├── auth.login/route.tsx     # ✅ Top-level (Login)
│   ├── app.tsx                  # ✅ Embedded (Layout app)
│   ├── app.dashboard.tsx        # ✅ Embedded (Dashboard)
│   └── app._index.tsx           # ✅ Embedded (Index)
├── entry.server.tsx             # ✅ Interception serveur
└── root.tsx                      # ✅ Script client inline
```

## Tests à effectuer

1. **OAuth en top-level** :
   - Accéder à `/auth/login?embedded=1`
   - Doit s'ouvrir dans une nouvelle fenêtre (top-level)
   - Ne doit PAS rester dans l'iframe

2. **App en embedded** :
   - Accéder à `/app/dashboard?embedded=1`
   - Doit rester dans l'iframe Shopify Admin
   - Ne doit PAS forcer la sortie

3. **Firefox** :
   - Tester l'OAuth dans Firefox
   - Ne doit pas afficher d'erreur de blocage iframe
   - Doit s'ouvrir en top-level automatiquement

## Code clé

### Route OAuth (top-level)
```typescript
// app/routes/auth.$.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const topLevelRedirect = ensureTopLevelLoader(request);
  if (topLevelRedirect) return topLevelRedirect;
  // ... reste du code
};

export default function AuthCallback() {
  return <TopLevelRedirect />;
}
```

### Route App (embedded)
```typescript
// app/routes/app.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Pas de force top-level - peut être embedded
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* ... */}
    </AppProvider>
  );
}
```

## ✅ Conclusion

Toutes les vérifications sont passées :
- ✅ Routes UI peuvent être embedded
- ✅ Routes OAuth/Admin sont toujours top-level
- ✅ Mécanisme de redirection automatique avec `window.top.location.href`
- ✅ Aucun code n'affiche admin.shopify.com dans un iframe

