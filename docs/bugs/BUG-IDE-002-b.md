---
id: BUG-IDE-002
---

## Bug

**Agent — `EEXIST` remonte en 500/502 opaque au lieu de 409.** `/files/create` écrit avec `flag:'wx'` ; `rethrowFsError` mappe `ENOENT`/`EISDIR`/`ENOTDIR`/`ENOSPC`/`EDQUOT` mais **pas `EEXIST`** → 500 non codé, réétiqueté par l'API en 502 `WORKSPACE_AGENT_REQUEST_FAILED`, c.-à-d. **le signal « pod mort »** : « New file » sur un nom existant affiche « Internal server error », et le 502 déclenche à tort le fallback local-runtime en dev (piège documenté juste au-dessus du mapping `ENOSPC`).

## 📤 Dispatché

✅

## 💻 Codé

✅ mergé `f5e75ee2` (PR #119, branche `fix/cluster-b-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **06/08** reproduit live

## Preuve

1er create `audit-new.txt` → **204** ; 2e create → **502 `WORKSPACE_AGENT_REQUEST_FAILED`** ; logs api prod : `"Workspace agent request failed: 500"` ; agent joint **en direct dans le pod** avec un token manager valide → `/files/write` **200** (agent sain, donc pas un pod mort) ; disque OK (`1%`, 9,6 G libres). Correctif : `EEXIST` → **409 `File already exists`** ; test 2e create → 409 + le contenu d'origine survit ; `workspace-agent` **47/47**. `LAUNCH_READINESS.md`

