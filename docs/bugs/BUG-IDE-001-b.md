---
id: BUG-IDE-001
---

## Bug

**Packages — l'install vise le mauvais workspace → 502, l'UI annonce un succès.** `POST /projects/:projectId/packages/install` appelait `authorizeRuntimeWorkspace(request, projectId, …)` ; passé un projectId ce résolveur retombe sur l'id déterministe `ws-<sha256(projectId:userId)[:16]>`, un pod inexistant dès que le workspace actif du projet est un autre enregistrement (workspace créé via l'API publique `POST /projects/:id/workspaces`, ou choisi dans le sélecteur du panneau). Dans le même bloc d'action, *audit*/*outdated* utilisaient bien le workspace résolu — seul *install* l'omettait.

## 📤 Dispatché

✅

## 💻 Codé

✅ mergé `f5e75ee2` (PR #119, branche `fix/cluster-b-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **06/08** reproduit live

## Preuve

Compte JETABLE sur prod, projet `cmshm2ued…`, workspace `cmshm3a5d…` RUNNING (`primaryWorkspaceId` = `activeWorkspaceId` = ce même id, 1 seul workspace en base) ; install ciblait `ws-dcc7ee0014fa4679`. Depuis l'**UI réelle** : POST panneau → **200 `{ok:true}`** mais `grep -c lodash package.json` → **0** et `ls node_modules/lodash` → **No such file or directory** ; run enregistré `exitCode 1 / failed / "Runtime request failed"` ; appel direct API → **502 `WORKSPACE_AGENT_REQUEST_FAILED`**. Correctif : `workspaceId` optionnel dans `packagesInstallSchema`, résolution `body.workspaceId ?? projectId` + rejet **403 `WORKSPACE_PROJECT_MISMATCH`** cross-projet, BFF transmet le workspace résolu. Tests : install ciblé + rejet cross-projet ; `api.spec.ts` **123/123**. `LAUNCH_READINESS.md`

