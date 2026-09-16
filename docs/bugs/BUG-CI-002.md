---
id: BUG-CI-002
---

## Bug

Le build Cloud Build `runtime-tier` lance six installations pnpm/Docker en parallèle sur une VM 8 Go et peut se figer sans logs, bloquant tous les rollouts production en file

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅ 24/07 (re-vérifié 10/08)

## Preuve

Reproduction réelle : build régional `ded1fb17-39b1-4ddf-903c-59784cdd54cf` en `WORKING`, dernier log à `2026-07-14T19:02:36Z` pendant les six builds parallèles. DAG deps→api→workspace-manager→preview-proxy→ai-gateway→worker→screenshotter désormais séquentiel ; test de garde 1/1, validation CI/CD, lint, format et typecheck global verts. **✅ Testé live 24/07** : rollout réel Cloud Build `07c99732` (config `infra/cloudbuild/runtime-tier.yaml`, SHA `58c2a05e` / PR #56) = **SUCCESS**, 9/9 étapes **strictement séquentielles** (chaque étape démarre exactement à la fin de la précédente, zéro chevauchement), total 4m42s, **aucun gel**. `docs/deploy-evidence/2026-07-24-bug-closeout/BUG-CI-002-runtime-tier-sequential.md` **Correction de suivi 10/08** : la colonne ✅ était restée à ☐ alors que la colonne Preuve documentait déjà le test live du 24/07. Re-contrôlé aujourd'hui sans rien croire sur parole : `infra/cloudbuild/runtime-tier.yaml` porte bien la chaîne `waitFor` **strictement sérielle** prime-cache → build-deps → build-api → build-workspace-manager → build-preview-proxy → build-ai-gateway → build-worker → build-screenshotter, et l'artefact `docs/deploy-evidence/2026-07-24-bug-closeout/BUG-CI-002-runtime-tier-sequential.md` porte le build réel `07c99732` **SUCCESS** avec 9/9 étapes sans chevauchement (4m42s).

