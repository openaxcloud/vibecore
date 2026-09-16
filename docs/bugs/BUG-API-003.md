---
id: BUG-API-003
---

## Bug

`POST /api/runtime/workspaces` répond 500 `API_ERROR` pendant un cold start : `metrics.increment('workspace_cold_start_pending_total')` (et `workspace_cold_start_write_recovered_total`, `app.ts:12714/14605/14820`, introduits par `a41239eb`/`bdce73d0`) jette `Unknown metric` car les compteurs ne sont pas déclarés dans le registre `@vibecore/observability`. Le pod workspace est bien créé avant le throw → l'UI voit un 500 au lieu de `starting`. Reproduit live le 15/07 (projet QA `cmrm9vobb00070nfe075k2bpv`, log `reqId 0e43d6cec610ca0b6bd357e77a16fbf7`).

## 📤 Dispatché

✅

## 💻 Codé

✅ `a41239eb`/`bdce73d0` (prod `6d57a401`)

## ✅ Testé live

✅ **24/07**

## Preuve

Compteurs déclarés dans `packages/observability`. **Preuve live dans le pod api prod** (`kubectl exec … tsx`) : `increment('workspace_cold_start_pending_total')` et `…_write_recovered_total` = **OK_NO_THROW** ; contrôle négatif (métrique inconnue) jette encore `Unknown metric` (garde réelle). **20 h de logs api prod = 0 erreur `Unknown metric`** (avant le fix chaque cold start en émettait une). Le throw seul cause du 500 est éliminé dans le binaire déployé. `docs/deploy-evidence/2026-07-24-bug-closeout/BUG-API-003-cold-start-metrics.md`

