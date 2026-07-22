# CTR-RELEASE-PUBLISH — persistent ReleaseCatalog (2026-07-21)

Branch `feat/release-catalog-persistent` → PR #44 (**no merge to main** — gate D6).
Lifts the v1 refusal: "no persistent ReleaseCatalog/Manifest + no live UI".

## What was already there (grepped first, not recreated)
- Publish→image-signed→AR→serverAppDeployment (proven live 2026-07-15).
- Rollback-by-digest core `release-rollback.ts` + endpoint (proven live, I-REL-1).
- The image digest persisted only inside `Deployment.metadata.serverDeploy.image`.
- `ReleaseManifest` as an in-memory TS interface; a `release-catalog-entry.schema.json`.
- The history UI (`DeployHistory`) with redeploy/rollback buttons.
- **Missing**: a first-class persistent ReleaseCatalog table + redeploy-from-history.

## What this adds
- **`ReleaseCatalogEntry`** (migration `0079`): each successful server publish
  appends ONE immutable entry — image by DIGEST, monotonic per-project `version`.
  `publishedByDeploymentId` is a plain pointer (no FK) so the catalog OUTLIVES the
  deployment/workspace (I-PUB-3). audit-v4 fields nullable (declared, not faked).
- Store: `createReleaseCatalogEntry` (monotonic version under withSerializedMutation),
  `listReleaseCatalog`, `getReleaseCatalogEntry`.
- Write hook in `runDeploymentBuildFlow` (best-effort; never fails a succeeded deploy).
- `GET /projects/:id/releases` (history); `POST /projects/:id/releases/:id/redeploy`
  (redeploy BY DIGEST via the proven rollback path — revision-independent).
- History UI: "release vN" badge + "redeploy release" button (server + has-release).
- Contract → v3, signatureResult PROVEN_REVIEW_PENDING.

## Reproducible proof (green)
`services/api/src/tests/release-catalog.spec.ts` — 5 tests, run:
```
cd services/api && pnpm vitest run src/tests/release-catalog.spec.ts --config vitest.config.ts
→ Test Files 1 passed, Tests 5 passed
```
Covers: monotonic version + ordered history + project scoping; history endpoint;
**redeploy-by-digest with the source deployment DELETED** (publishedByDeploymentId
→ a non-existent id) → 201, manager gets `imageRef@sha256:…`,
`resolvedWithoutLiveRevision=true` (**I-PUB-3 proven**); unknown/cross-project 404;
digest-less entry 409 (never a dead-URL redeploy).

No regression: `deployment-rollback-digest` + `release-rollback` specs stay green
(21 tests total). Strict runtime build (`tsc NodeNext` from `src/server.ts`) = **0 errors**.
Pre-commit gate (pnpm typecheck + pnpm lint) = green.

## Honest — remaining
- **Live UI-click proof** (real publish → entry persisted → visible in history →
  redeploy from history, in prod) awaits **deploying the branch** (migration 0079
  isn't in prod until then; no merge without go-ahead — D6). The reproducible test
  proves the full chain deterministically now.
- Audit-v4 fields (promotion/sbom/provenance/config refs) stay nullable until the
  snapshot-image pipeline emits them.
