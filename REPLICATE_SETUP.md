# Configuration Replicate - VTON Magic

## ✅ Vérification de l'intégration Replicate

### 1. Service Replicate
- **Fichier:** `app/lib/services/replicate.service.ts`
- **Modèle:** `cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985`
- **Status:** ✅ Configuré et fonctionnel

### 2. Endpoint de génération
- **Route:** `POST /apps/tryon/generate`
- **Fichier:** `app/routes/apps.tryon.generate.tsx`
- **Fonctionnalités:**
  - ✅ Vérification signature Shopify
  - ✅ Vérification crédits
  - ✅ Rate limiting
  - ✅ Appel Replicate API
  - ✅ Logging des résultats
  - ✅ Gestion des erreurs

### 3. Test dans l'admin
- **Route:** `app/routes/app.widget.tsx` (action test-tryon)
- **Status:** ✅ Utilise maintenant Replicate (au lieu d'un placeholder)

### 4. Widget frontend
- **Route:** `app/routes/apps.tryon.widget.tsx`
- **Status:** ✅ Appelle `/apps/tryon/generate` qui utilise Replicate

## 🔧 Configuration requise

### Variable d'environnement
```bash
REPLICATE_API_TOKEN=r8_votre_token_ici
```

### Où obtenir le token
1. Aller sur https://replicate.com
2. Créer un compte
3. Aller dans Account Settings > API Tokens
4. Créer un nouveau token
5. Copier le token (commence par `r8_`)

### Vérification
Pour vérifier que Replicate est bien connecté :

1. **Vérifier la variable d'environnement:**
   ```bash
   echo $REPLICATE_API_TOKEN
   # ou sur Windows:
   echo %REPLICATE_API_TOKEN%
   ```

2. **Tester depuis l'admin:**
   - Aller sur `/app/widget`
   - Section "Test AI Virtual Try-On"
   - Uploader une photo de personne et une image de vêtement
   - Cliquer sur "Run Try-On Test"
   - Si Replicate est configuré, vous verrez le résultat réel
   - Si non configuré, vous verrez une erreur claire

3. **Tester depuis le storefront:**
   - Aller sur une page produit
   - Cliquer sur le bouton "Try It On"
   - Uploader une photo
   - Générer le try-on
   - Le résultat devrait venir de Replicate

## ⚠️ Dépannage

### Erreur: "REPLICATE_API_TOKEN is not configured"
- **Solution:** Ajouter `REPLICATE_API_TOKEN` dans vos variables d'environnement
- **Railway:** Settings > Variables > Add Variable
- **Local:** Créer un fichier `.env` avec `REPLICATE_API_TOKEN=...`

### Erreur: "Replicate generation failed"
- Vérifier que le token est valide
- Vérifier que vous avez des crédits Replicate
- Vérifier les logs pour plus de détails

### Le test retourne toujours un placeholder
- ✅ **Corrigé:** Le test utilise maintenant Replicate au lieu d'un placeholder

## 📊 Flux de génération

1. **Client upload photo** → Widget frontend
2. **Widget envoie** → `/apps/tryon/generate`
3. **Endpoint vérifie** → Crédits, rate limit, signature
4. **Endpoint appelle** → `replicate.service.ts`
5. **Service Replicate** → Génère l'image via API
6. **Résultat retourné** → URL de l'image générée
7. **Affichage** → Image affichée au client

## ✅ Status actuel

- ✅ Service Replicate configuré
- ✅ Endpoint generate fonctionnel
- ✅ Test admin utilise Replicate
- ✅ Widget frontend connecté
- ✅ Gestion erreurs complète
- ✅ Logging des résultats

**Le service de try-on IA est maintenant complètement fonctionnel avec Replicate !**



