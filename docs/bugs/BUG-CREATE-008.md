---
id: BUG-CREATE-008
---

## Bug

**P2 — métrique incrémentée sans déclaration : chaque reseed RÉUSSI était journalisé comme un échec.** `metrics.increment('workspace_runtime_reseed_total')` sur un nom absent du registre → levée → rattrapée par le `catch` de la réconciliation → `runtime reseed reconciliation failed`. Le journal disait l'inverse de ce qui s'était passé, ce qui rendait illisibles les incidents de création.

## 📤 Dispatché

☑

## 💻 Codé

☑ *(`e462b304`, PR #139 non mergée)*

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

Journaux API `Unknown metric: workspace_runtime_reseed_total` ; garde `packages/observability/src/declared-metrics.spec.ts` vérifiée rouge sans la déclaration

