---
id: BUG-CREATE-002
---

## Bug

**P0 — le rejet de quota est invisible.** `workspaceQuotaPrompt` construit bien le message et le lien d'offre, mais le seul rendu est un `!` dans une pastille de barre d'état et l'`attribut title` d'un survol. Mesuré sur l'IDE d'un projet dont le démarrage a été rejeté : panneau Problèmes = **« Aucun problème détecté · 0 erreurs · 0 avertissements »**, et le mot « quota » **absent de toute la page** pendant 110 s d'observation. La console, elle, dit `Workspace start failed: RuntimeError: Remote runtime request failed: 429`.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`/tmp/suivi.mjs` — 24 relevés à 4 s d'intervalle ; `quota-problemes.png` **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/components/chat/quota-rejet-visible.spec.ts`, `services/api/src/quota-espaces-fantomes.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

