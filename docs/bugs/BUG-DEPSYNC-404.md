---
id: BUG-DEPSYNC-404
---

## Bug

**« Game FR : Dependency sync skipped … 404 »** — la synchro des dépendances (`#syncPreviewManifestFromRuntime`, `withRuntimeRetry`) saute sur un 404. Même course de provisioning que #108 mais sur un **AUTRE chemin de retry** : `app/lib/runtime/retry.ts isTransientRuntimeError` — non touché par #108. Un 404 y est non-transient → non retenté → skip → node_modules vide → aperçu mort.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `0dcc845e` (PR #117, branche `fix/preview-injection-runtime-resilience`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

⚠️ **Prouvé unitairement** (course provisioning non reproductible en sandbox)

## Preuve

**Fix** `app/lib/runtime/retry.ts` : un 404 de code `WORKSPACE_NOT_FOUND`/`PROJECT_NOT_FOUND` est désormais **transient** → `withRuntimeRetry` (8 tentatives ~35 s) s'auto-répare ; projet réellement supprimé échoue toujours après retries (miroir #108 sur ce 2ᵉ chemin). Test `retry.spec` : provisioning-404 → transient ; 404 générique → non retenté ; 13 tests verts.

