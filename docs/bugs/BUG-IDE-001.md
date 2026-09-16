---
id: BUG-IDE-001
---

## Bug

**P0 — le panneau Activity crashe à chaque ouverture, en prod** : `ReferenceError: FilterChip is not defined`, rattrapé par la panel boundary → « The Activity panel crashed ». `dfeedd8b` (2026-07-05) a ajouté la rangée de chips de filtre à `ProjectActivityPanel` **sans ajouter l'import**. Invisible pour la CI parce que `app/components/chat/BaseChat.tsx` porte `// @ts-nocheck` — or ce fichier contient **tous** les panneaux de l'IDE.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `d3081c34` (PR #120, branche `fix/cluster-d-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé live 06/08**

## Preuve

Reproduit sur `app.e-code.ai` (compte jetable, projet neuf) sur **6/6** combinaisons web/tablette/mobile × clair/sombre. Console : `ReferenceError: FilterChip is not defined at BaseChat-CGIUrBzt.js:400:19127` + `[panelBoundary] Activity crashed`. Fix = l'import manquant. Verdicts complets : `LAUNCH_READINESS.md`.

