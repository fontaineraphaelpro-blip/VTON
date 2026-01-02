# 🔧 Guide de dépannage - Boucle OAuth infinie

## 🚨 Symptôme : Boucle de redirection infinie

Quand vous essayez d'ouvrir votre app embedded dans l'admin Shopify, vous êtes pris dans une boucle de redirection entre `/auth/exit-iframe` et `/auth`.

## 🔍 Cause du problème

Shopify essaie d'ouvrir ton app embedded dans l'iframe admin.

Ton app détecte que la requête est embedded, mais l'URL host/redirect ne correspond pas.

Ton app redirige vers `/auth/exit-iframe` → Shopify te renvoie dans `/auth` → et ça recommence indéfiniment.

**C'est quasi toujours dû à un de ces points :**

1. ✅ Tu utilises `localhost` sans HTTPS (Shopify n'accepte pas localhost pour apps embedded dans l'admin)
2. ✅ Le `HOST` ou `SHOPIFY_APP_URL` dans ton `.env` ne correspond pas à l'URL Shopify
3. ✅ Les URLs de redirection whitelistées dans Shopify Partners ne matchent pas ton app

---

## ✅ Comment corriger ça étape par étape

### 1️⃣ Utilise HTTPS avec ngrok (pour le développement local)

**Installation ngrok :**
```bash
# Télécharger depuis https://ngrok.com/download
# Ou avec npm
npm install -g ngrok
```

**Démarrer ngrok :**
```bash
ngrok http 3000
```

Copie l'URL HTTPS, exemple : `https://abcd1234.ngrok.io`

⚠️ **Note :** Pour le développement, utilisez un tunnel ngrok gratuit. Pour la production, utilisez votre URL de production (ex: Railway, Render, etc.)

---

### 2️⃣ Mettre à jour ton `.env`

Créez/modifiez le fichier `.env` dans `vton-shopify-remix/` :

**Pour le développement local (avec ngrok) :**
```env
SHOPIFY_API_KEY=xxxxx
SHOPIFY_API_SECRET=xxxxx
SCOPES=read_products,write_products,read_orders,write_orders
SHOPIFY_APP_URL=https://abcd1234.ngrok.io
DATABASE_URL=postgresql://username:password@host:5432/database
REPLICATE_API_TOKEN=votre_token_ici
```

**Pour la production (Railway/Render/etc.) :**
```env
SHOPIFY_API_KEY=xxxxx
SHOPIFY_API_SECRET=xxxxx
SCOPES=read_products,write_products,read_orders,write_orders
SHOPIFY_APP_URL=https://vton-production-890a.up.railway.app
DATABASE_URL=postgresql://username:password@host:5432/database
REPLICATE_API_TOKEN=votre_token_ici
```

⚠️ **Important :** 
- Utilisez **HTTPS** uniquement (jamais HTTP pour embedded apps)
- L'URL doit correspondre **exactement** à celle dans Shopify Partners

---

### 3️⃣ Configurer Shopify Partners → ton app

Allez sur [partners.shopify.com](https://partners.shopify.com) → Votre app → Configuration

**Pour le développement local :**
- **App URL** → `https://abcd1234.ngrok.io`
- **Allowed redirection URL(s)** → `https://abcd1234.ngrok.io/auth/callback`

**Pour la production :**
- **App URL** → `https://vton-production-890a.up.railway.app`
- **Allowed redirection URL(s)** → `https://vton-production-890a.up.railway.app/auth/callback`

⚠️ **Exact match obligatoire, sinon boucle infinie !**

---

### 4️⃣ Vérifier `shopify.app.toml`

Le fichier `shopify.app.toml` doit aussi correspondre :

**Pour le développement local :**
```toml
application_url = "https://abcd1234.ngrok.io"
embedded = true

[auth]
redirect_urls = [
  "https://abcd1234.ngrok.io/auth/callback"
]
```

**Pour la production :**
```toml
application_url = "https://vton-production-890a.up.railway.app"
embedded = true

[auth]
redirect_urls = [
  "https://vton-production-890a.up.railway.app/auth/callback"
]
```

---

### 5️⃣ Supprimer les cookies et sessions Shopify

**Dans votre navigateur :**
1. Ouvrez les DevTools (F12)
2. Onglet Application → Cookies
3. Supprimez tous les cookies liés à votre boutique Shopify
4. Ou utilisez une navigation privée

**Dans votre base de données :**
```sql
DELETE FROM "Session";
```

Ou via Prisma Studio :
```bash
npx prisma studio
# Supprimez toutes les sessions
```

---

### 6️⃣ Relancer ton serveur Remix

```bash
npm run dev
```

---

### 7️⃣ Tester l'installation

1. Ouvrez votre boutique Shopify admin
2. Allez dans **Apps** → **Votre app**
3. L'installation devrait fonctionner sans boucle

---

## 🔄 Checklist de vérification

- [ ] Utilisez **HTTPS** (pas HTTP, pas localhost)
- [ ] `SHOPIFY_APP_URL` dans `.env` correspond à l'URL dans Shopify Partners
- [ ] URL de callback dans Shopify Partners : `[votre-url]/auth/callback`
- [ ] `shopify.app.toml` a les bonnes URLs
- [ ] Cookies/sessions supprimés
- [ ] Serveur redémarré
- [ ] Base de données accessible

---

## 📝 Notes importantes

1. **Ngrok URLs changent** : Si vous redémarrez ngrok, l'URL change. Vous devez mettre à jour :
   - Le `.env`
   - Shopify Partners Dashboard
   - `shopify.app.toml` (optionnel si vous utilisez `automatically_update_urls_on_dev = true`)

2. **Production vs Développement** : 
   - En développement : utilisez ngrok
   - En production : utilisez votre URL de production stable

3. **Shopify CLI** : Si vous utilisez `shopify app dev`, il gère automatiquement ngrok, mais vérifiez quand même les URLs.

---

## 🆘 Si ça ne fonctionne toujours pas

1. Vérifiez les logs du serveur pour voir les URLs utilisées
2. Vérifiez la console du navigateur (erreurs réseau)
3. Vérifiez que votre app est bien configurée comme **embedded app** dans `shopify.app.toml`
4. Vérifiez les scopes demandés dans `.env` correspondent à ceux autorisés
5. Contactez le support Shopify si le problème persiste

