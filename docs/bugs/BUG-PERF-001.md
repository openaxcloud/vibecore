---
id: BUG-PERF-001
---

## Bug

**P1 — amplification d'écritures agent ×40 vers le pod runtime.** Une génération écrit le fichier ENTIER à répétition au lieu d'une fois : **1018 `PUT /files/write` pour 25 fichiers**, dont **151 pour un seul** (`src/App.tsx`). Toutes répondent `204` — c'est du gaspillage, pas une erreur. Conséquences : file d'exécution sérielle saturée pendant toute la génération, latence de convergence du runtime, et charge inutile sur l'API et le pod. **Non bloquant pour la démo** : depuis `dacad880` les fichiers arrivent bien et l'app se rend (cf. BUG-AGENT-001/002/004). ⚠️ La cause n'est PAS la matérialisation streaming corrigée dans `08d6ad99` : ce correctif limite bien à 1 la seule branche `if (!doc)`, et la mesure ci-dessus est POSTÉRIEURE à son déploiement. La source dominante des écritures reste à identifier.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 16/08**

## Preuve

Env d'audit `vibecore-audit-test-20260807`, image `web:ae157e962b` (= `ae157e96`, correctifs P0 inclus), projet `cmsv07fhl01j30ne99tvrpolp`. Mesure par intercepteur `fetch` posé sur `/projects/new` AVANT soumission — il survit à la navigation vers l'IDE, qui est côté client — comptant `path` + `status` de chaque `PUT …/files/write` : 1018 appels, 25 chemins distincts, max 151, moyenne 40,7, **0 échec**. Ordre de grandeur cohérent avec le relevé QA du 15/08 (750 pour 20 fichiers, ×37). ⚠️ Piège de mesure : `runAction(…, true)` passe par un sampler à 100 ms (`ACTION_STREAM_SAMPLE_INTERVAL_MS`) — des ticks synchrones sont coalescés et **masquent** l'amplification ; les espacer de >100 ms pour la reproduire en test. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/runtime/action-runner.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

