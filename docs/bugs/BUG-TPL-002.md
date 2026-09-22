---
id: BUG-TPL-002
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**`POST /orgs/:orgId/projects/from-ai` crée un projet contenant UNIQUEMENT `README.md`** — pas de `package.json`, pas de point d'entrée, pas de config Vite. Aucun `npm run dev` n'est possible : pas de dev server, pas d'aperçu, pas de runtime. C'est le parcours principal de création (le formulaire de prompt de l'accueil).

## 📤

✅ 12/08

## 💻

☑ 09/09

## ✅

**Revérifié le 09/09 : corrigé.** Le squelette pose `package.json`, `index.html` et `src/main.tsx` en plus du README — le projet n'est plus vide.

## Preuve

☐ live iPhone

