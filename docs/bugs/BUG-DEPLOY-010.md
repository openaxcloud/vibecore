---
id: BUG-DEPLOY-010
---

## Bug

**P0 — PANNEAU DÉPLOIEMENT : tout déploiement échoue, le bac à sable de compilation est créé VIDE.** L'installation des dépendances meurt sur `npm error enoent Could not read package.json: '/workspace/.vibecore-deploy-<id>/package.json'`, **sortie 254**. Le répertoire isolé existe (npm y cherche le fichier) mais **aucun fichier du projet n'y a été copié**, alors que l'espace de travail source les contient bien. **Reproductible : 2 déploiements sur 2.**

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09 — *diagnostic seulement, la copie reste à réparer*

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

**Repro** — env d'audit `1c68880b39`, projet réel `React SaaS` (`cmsxd9jwy00540ngvme46r9ts`, ws `ws-7e8d7bd2a9e13f44`), panneau Déploiements → **Gérer** → *Déployer le projet* (export statique, aperçu, `npm run build`, sortie `dist`). Déploiements `cmsxdq0e8001m0nhbhio6b5fg` (18:19) et `cmsxe8rz4008n0ngvrgoz556i` (18:33) : **FAILED** tous les deux, journaux identiques. **Contre-preuve décisive** : le contenu source est présent — `GET /files?path=.` renvoie `index.html`, `package.json`, `src/` (`App.tsx`, `main.tsx`, `styles.css`), `tsconfig.json`, `vite.config.ts` — et **le script de préparation, rejoué à l'identique dans le pod, fonctionne** : `rm -rf` + `mkdir -p` + `find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git ! -name <sandbox> -exec cp -a {} <sandbox>/ ';'` produit bien les 5 entrées (`ls

