---
id: BUG-IDESTATE-412
---

## Bug

**« Game EN : 412 sur ide-state »** — `PUT /api/projects/:id/ide-state` renvoie 412 (If-Match/optimistic concurrency) quand deux writers (agent + IDE pendant la génération) se courent après. Le client re-mergeait + retry (correct) MAIS : (a) le `continue` sur 412 **sautait le backoff** → 4 PUT back-to-back en ms, aggravant la course et épuisant le budget ; (b) à l'épuisement, `persistWithRetry` **jetait** le 412 → erreur qui casse l'IDE, alors que l'état re-mergé est **déjà durablement en attente**.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `0dcc845e` (PR #117, branche `fix/preview-injection-runtime-resilience`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

⚠️ **Prouvé unitairement** (course live full-stack non reproductible en sandbox)

## Preuve

**Fix** `app/lib/persistence/projectIdeMemory.ts` : (1) **backoff** (≤500 ms) avant le re-PUT sur 412 ; (2) épuisement sur 412 persistant → **retour gracieux** (pas de throw), l'état reste en attente pour le prochain flush. Test : 412 persistant → `resolves`, `agentWidth:800` survit ; 25 tests verts (dont 2 recoveries 412 existantes).

