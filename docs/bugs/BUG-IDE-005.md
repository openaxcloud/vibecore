---
id: BUG-IDE-005
---

## Bug

**P2 — les sessions de debug restent « running » indéfiniment** : `start-session` écrit le statut une fois et seul un arrêt explicite le réécrit. Un lancement qui se termine une seconde plus tard (normal pour un script, habituel pour un plantage) continue d'afficher « running » avec un bouton Stop actif.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `d3081c34` (PR #120, branche `fix/cluster-d-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé live 06/08**

## Preuve

Prod : lancement `node -e "…"` (sortie en quelques ms) → session **`running`** ; « RUNTIME PROCESSES 0 » en même temps. Fix : le loader du Debugger réconcilie le statut contre la liste des processus vivants du workspace, **en lecture seule** ; une liste illisible ne déclasse rien. 10 tests.

