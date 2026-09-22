---
id: BUG-RUNTIME-404
---

## Bug

**« Remote runtime request failed: 404 »** (agent Solutions) — un appel runtime 404 **hard-latché** (jamais retry). Cause : `packages/runtime-remote/src/index.ts` jette pour tout non-2xx ; **404 absent de `TRANSIENT_STATUSES`** (`app/lib/runtime/retry.ts`) et de `#isTransientStartError`. Les 404 agent/manager sont déjà repliés en 502 (retry) ; le 404 **client** vient de `authorizeRuntimeWorkspace` quand une op runtime (write de reseed, `ports`, `status`) part **avant que `POST /workspaces` ait créé l'enregistrement** → `PROJECT_NOT_FOUND`/`WORKSPACE_NOT_FOUND`. Course de provisioning, pas ressource manquante.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `6184cb4f` (PR #108, branche `fix/preview-devserver-runtime`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

⚠️ **Prouvé unitairement** (course provisioning full-stack non reproductible en sandbox)

## Preuve

**Fix** `packages/runtime-remote/src/index.ts` : nouveau prédicat `#isRetryableProvisioningError` (404 avec code `WORKSPACE_NOT_FOUND`/`PROJECT_NOT_FOUND`, ou 425 Too Early) ajouté à la condition de retry de `#request` — les ops idempotentes (writes de reseed `retryIdempotentWrite`, `status`/`ports` `retryReads`, 4 tentatives ~1,5 s) **s'auto-réparent** le temps que l'enregistrement existe ; un projet réellement supprimé échoue toujours après les retries (pas de storm). Tests runtime-remote **30/30** (2 nouveaux : write 404 PROJECT_NOT_FOUND→retry→204 ; 404 code inconnu→**pas de retry**, échec immédiat) + typecheck vert.

