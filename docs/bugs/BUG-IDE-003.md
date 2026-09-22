---
id: BUG-IDE-003
---

## Bug

**P1 — Problems ne se vide jamais après correction du code** : `workspaceLogs` est un tampon circulaire append-only et rien ne retirait une erreur de transformation Vite **résolue**. Un fichier réparé garde un compteur d'erreurs rouge pour toute la session ; seul un rechargement de page l'efface.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `d3081c34` (PR #120, branche `fix/cluster-d-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé live 06/08**

## Preuve

`src/App.tsx` cassé depuis le shell du workspace → erreur affichée en **8 s** ✅ ; fichier réparé → **la même erreur au même horodatage (3:08:59 PM) toujours affichée 100 s plus tard**. Fix : `buildRuntimeDiagnostics` retire les erreurs de build d'un module dès qu'un `hmr update`/`page reload` ultérieur de ce module prouve qu'il se transforme à nouveau (balayage ordonné → recasser re-signale ; une exception runtime n'est jamais retirée). 6 tests.

