---
id: BUG-QA0930-DEPLOIEMENT-QUOTA-MASQUE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (premier déploiement) — RÉGRESSION de #628 (servi le 30/09). Un client gratuit dont un autre
projet a un espace actif ne peut plus déployer, et on lui dit de réessayer.**

Mesuré le 2026-10-01 en vraie API (build statique réel, rien de remplacé) : compte gratuit, projet A
avec son espace `RUNNING` (pod vivant côté manager), déploiement du projet B. Le build statique se fait
dans l'espace du projet ; depuis #628, son démarrage passe par le quota `workspaces.active` et il est
refusé. `realBuildStaticInWorkspacePod` rendait ce refus sous le seul message
`DEPLOY_WORKSPACE_UNREACHABLE`. Unique ligne d'erreur du déploiement, `FAILED` :

> Workspace is starting — please retry. The build runs in your project workspace, which could not be
> reached in time. [WORKSPACE_UNREACHABLE] QUOTA_EXCEEDED — HTTP 429 — Quota exceeded for workspaces.active

Le client réessaie sans fin : réessayer ne changera rien. Avant #628, ce déploiement passait (au prix d'un
second espace au-delà du forfait).

## Cause

`services/api/src/app.ts`, `realBuildStaticInWorkspacePod` : le `catch` d'`ensureWorkspaceReachable`
classait TOUT refus en `WORKSPACE_UNREACHABLE`, y compris `QUOTA_EXCEEDED`.

## Repro

`services/api/src/tests/deploiement-refus-quota.spec.ts` (voir ci-dessous).

## 📤

☑ 01/10 PR (voir Preuve)

## 💻

☐

## ✅

☐

## Preuve

Refus pour quota → refus `WORKSPACE_QUOTA` et message `DEPLOY_WORKSPACE_QUOTA` (« Votre forfait permet un
seul espace de travail actif à la fois… arrêtez l'espace de ce projet, ou passez à un forfait supérieur »).
Épinglé par `services/api/src/tests/deploiement-refus-quota.spec.ts` : rouge avant (message cité
ci-dessus), vert après ; TÉMOIN — créneau libre mais espace qui ne répond pas → « please retry » reste le
message (c'est alors le bon conseil). Suite API : 2 225 tests verts.
