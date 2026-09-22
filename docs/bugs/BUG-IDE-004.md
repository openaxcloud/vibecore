---
id: BUG-IDE-004
---

## Bug

**P2 — pas de lien « aller à la ligne » sur les erreurs Vite** : le motif de localisation ne reconnaissait que `fichier:ligne`, alors que Vite/babel écrivent `fichier: <raison> (ligne:colonne)` — la classe d'erreur la plus fréquente ici. La ligne Problems s'affiche sans lien alors que le message donne fichier **et** position.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `d3081c34` (PR #120, branche `fix/cluster-d-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé live 06/08**

## Preuve

Prod : `[vite] Pre-transform error: /workspace/src/App.tsx: Unterminated JSX contents. (1:60)` → `document.querySelectorAll('.bolt-project-problem-open')` = **[]**. Fix : parsing extrait dans `app/lib/stores/problem-location.ts`, gère les deux formes. 6 tests.

