# Rollback live proof — plan (audit v4 vertical)

Goal: prove I-REL-1 end-to-end in prod — a server rollback re-deploys the retained
image BY DIGEST even after the current revision is gone.

## Preconditions
- api image carries the rollback code (digest capture + wiring): commit ≥ `9680b20e`.
- `SERVER_DEPLOY_SNAPSHOT_IMAGE=1` (confirmed in platform-env configmap).
- `SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1` on the api (to be enabled — flag-gated).

## Steps (throwaway project only)
1. Mint a QA session (kubectl exec api pod; see reference_prod_qa_session_mint).
2. Create a throwaway project with a minimal Node server returning `v1`.
3. Deploy v1 (provider=server) → READY. Record `metadata.serverDeploy.image.imageDigest` = digest_v1.
4. Change the app to return `v2`; deploy v2 → READY. GET v2 URL → "v2".
5. Delete v1's running k8s Deployment (the "revision") via the manager stop — the
   AR image (digest_v1) remains, the running pod does NOT.
6. POST /projects/:id/deployments/:v1Id/rollback → new READY row.
7. GET the rollback URL → **serves "v1"** (re-pulled from digest_v1, not a live v1 pod).
8. Negative A: rollback a target with no retained digest → 409 ROLLBACK_NO_RETAINED_DIGEST.
9. Negative B: rotate a secret, rollback with policy CURRENT → app sees the rotated value.

## Artifacts to capture (raw)
- digest_v1 / digest_v2 (deployment metadata JSON)
- v2 URL body ("v2"), post-rollback URL body ("v1")
- kubectl proof that v1's deployment was deleted before rollback
- the rollback row's serverDeploy.rolledBackFromDigest == digest_v1
- 409 bodies for the negatives
