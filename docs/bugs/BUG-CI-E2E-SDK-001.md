---
id: BUG-CI-E2E-SDK-001
---

## Bug

**NON-DÉFAUT établi — la montée `@ai-sdk/anthropic` 0.0.39 → 1.2.12 n'a PAS cassé l'E2E.** L'auteur de #529 avait explicitement laissé la question ouverte (« `node_modules` porte encore 0.0.39 … LA CI SERA LA PREMIÈRE À EXÉCUTER LA NOUVELLE VERSION »), et le run 1601 de `deploy-main.yml` a effectivement été REFUSÉ par la porte sur `Production E2E — run concluded 'failure'`. Lu seul, ce rouge accuse la montée.

## 📤 Dispatché

—

## 💻 Codé

—

## ✅ Testé live

✅ 10/09

## Preuve

**NON-DÉFAUT, donc fermé sans test (exception de la règle 16).** Mesure décisive : l'E2E de `main` est vert sur `55b8696a2` (13:09) et `a7f4cd009` (13:17), ROUGE une fois sur `7bde245cc` (13:43), puis **vert sur `aec89ae08` (13:58) et `9c68fe9b4` (14:20) — deux SHA qui CONTIENNENT la montée**. Un échec isolé encadré de verts portant le même code ne peut pas venir du code (règle 2 : relancer avant d'accuser). `Production CI` était d'ailleurs VERT sur `7bde245cc` — seul l'E2E a rougi. Confirmé indépendamment côté unitaire : suite complète relancée sur un arbre réellement installé en `1.2.12` → **8410 tests verts**. Aucune action requise ; l'entrée existe pour qu'on ne reparte pas chercher une régression inexistante.

