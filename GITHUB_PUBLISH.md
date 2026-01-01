# 📤 Publier sur GitHub

## ✅ Étape 1 : Créer un nouveau dépôt GitHub

1. Allez sur [GitHub](https://github.com) et connectez-vous
2. Cliquez sur le bouton **"New"** ou **"+"** en haut à droite
3. Remplissez les informations :
   - **Repository name** : `vton-shopify-remix` (ou le nom de votre choix)
   - **Description** : "Virtual Try-On Shopify App avec Remix"
   - **Visibility** : Public ou Private (selon votre préférence)
   - **NE PAS** cocher "Initialize this repository with a README" (le projet a déjà un README)
4. Cliquez sur **"Create repository"**

## ✅ Étape 2 : Changer le remote et pousser

Une fois le dépôt créé, GitHub vous donnera une URL. Utilisez-la dans les commandes suivantes :

```bash
# Changer le remote origin vers votre nouveau dépôt
git remote set-url origin https://github.com/VOTRE_USERNAME/vton-shopify-remix.git

# Ou si vous utilisez SSH :
# git remote set-url origin git@github.com:VOTRE_USERNAME/vton-shopify-remix.git

# Pousser le code vers GitHub
git push -u origin main
```

## 🔐 Authentification GitHub

Si vous n'êtes pas authentifié, GitHub vous demandera vos identifiants. Vous pouvez utiliser :
- **Personal Access Token** (recommandé) : Créez-en un dans Settings > Developer settings > Personal access tokens
- **GitHub CLI** : `gh auth login`

## ✅ Vérification

Après le push, vérifiez que tout est bien sur GitHub :
- Allez sur votre dépôt GitHub
- Vérifiez que tous les fichiers sont présents
- Vérifiez que le README.md s'affiche correctement

## 📝 Notes importantes

- Le fichier `.env` est dans `.gitignore` et ne sera **pas** poussé (c'est normal et sécurisé)
- Le dossier `build/` est aussi ignoré (il sera régénéré lors du déploiement)
- Le dossier `node_modules/` est ignoré (les dépendances sont dans `package.json`)

