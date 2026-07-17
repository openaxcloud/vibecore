# Rollback vertical — LIVE proof (audit v4, I-REL-1)

Proven live against prod (`api.e-code.ai`, api image `ec0ad6bd3e`) 2026-07-17.
Server rollback re-deploys the RETAINED image BY DIGEST even after the current
revision is deleted — the app comes back from its digest.

## The exact required scenario (deploy v1 → v2 → delete v1's revision → rollback → serves v1)

| step | fact | artifact |
|---|---|---|
| deploy v1 | READY, digest_v1 = `sha256:657271c5…`, serves `ROLLBACK-PROOF v1` | `row-v1.json`, `RUN.log` |
| deploy v2 | READY, digest_v2 = `sha256:2eb96530…` (DIFFERENT), serves `ROLLBACK-PROOF v2` | `row-v2.json`, `RUN.log` |
| delete v1 revision | `kubectl delete deploy app-cmro606md…` → deleted; v1 URL → **HTTP 410** | `08-delete-v1-revision.txt` |
| rollback(v1) | NEW deployment `cmro7pqzx…`, `status=READY`, `rolledBackFromDigest=sha256:657271c5…`, log: *"Rollback re-deployed the retained image by digest …@sha256:657271c5… (revision-independent, I-REL-1; secretPolicy=CURRENT)"* | `10-rollback-fixed.json` |
| re-created pod | `app-cmro7pqzx…` image = `p-cmro5znqg…@sha256:657271c5…` (PULL BY DIGEST), ready 1/1 | `11-kubectl-evidence.txt` |
| **served body** | **`ROLLBACK-PROOF v1`** — v1 resurrected from the retained digest, AFTER its revision was deleted | `12-rollback-body.txt` |

## The two mandatory negatives (live, real prod endpoint)

| case | result | artifact |
|---|---|---|
| rollback with **no retained digest** (digest stripped in DB) | **409 `ROLLBACK_NO_RETAINED_DIGEST`** — "cannot re-deploy from the catalog (would point at a possibly-dead URL)". Nothing re-deployed. | `13-negative-no-digest.json` |
| rollback with **secretPolicy=PINNED, no snapshot** | **409 `ROLLBACK_SECRET_POLICY_UNSATISFIABLE`** — "Refusing rather than serving current values under a pinned label" | `14-negative-secret-pinned.json` |

## What the live proof caught that the handler test did not

The handler integration test (`deployment-rollback-digest.spec.ts`) passed with the
rollback row created `READY`, because `TestApiStore` does not model the real store's
MONOTONIC status guard. In prod that guard silently dropped the re-deploy (a READY
row can't be mutated), and the endpoint returned the old URL-copy row. Fix `ec0ad6bd`
creates the digest-rollback row NON-TERMINAL (`QUEUED`) so the re-deploy promotes it
`QUEUED→READY`. This is exactly why the live proof exists — a unit/handler test with
a fake store does not prove the wiring holds in prod.

## Reproduce
`bash run.sh` (registers a throwaway user, grants a `deployments.count` QuotaOverride,
deploys v1/v2, deletes v1's revision, rolls back). Requires
`SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1` on the api (see note below).

## Prod flag note
`SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1` was enabled on the api deployment for this
proof (`kubectl set env`). For PERMANENT enablement it belongs in `values-prod.yaml`
/ the configmap template. Enabling it prod-wide changes rollback behaviour for
digest-LESS (pre-fix) deployments: they now get a loud 409 instead of a
possibly-dead URL-copy row — more honest, but a visible behaviour change worth an
explicit decision.
