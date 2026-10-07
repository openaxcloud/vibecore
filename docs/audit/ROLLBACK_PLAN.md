# Gate 1 — Rollback Plan

## Status and scope

Audited baseline: 8a93e995b37de513a142acaf41fed364787c5e4e.

This is a proposed rollback architecture for the migration described in
MIGRATION_DAG.md. It is not proof that rollback currently works and is not
SIGNED_PROVEN.

Operational release procedures remain in docs/DEPLOY_RUNBOOK.md. Delivery and live-test
state remain in PLAN_REMAINING_UNIFIED.md, REPLIT_PARITY.md and the design/bug tracking
files. No tracking state was changed.

## Invariants

1. Rollback targets immutable code and image digests, never an unverified mutable tag.
2. A database rollback never destroys data written by the newer version.
3. Old readers remain compatible through the rollback window.
4. Secrets are revoked or rotated when a rollback changes the trust boundary.
5. Runtime rollback preserves project files and workspace PVC identity.
6. Deployment rollback verifies endpoint content and digest, not only a READY row.
7. Every rollback is idempotent and safe to resume after operator or process failure.
8. A rollback is successful only after observable service, data and audit invariants pass.

## Rollback matrix

| Change class | Trigger | Immediate action | Data action | Proof required |
|---|---|---|---|---|
| Contracts/clients | Error-code or payload compatibility regression | Disable new client flag and route through legacy adapter | None; retain both schemas | Contract replay against both clients |
| API module extraction | Increased errors or semantic mismatch | Repoint route façade to legacy handler | Keep shared tables unchanged | Golden route diff and audit comparison |
| Outbox/worker | Duplicate, lost or reordered side effect | Pause new consumer and restore old command path | Retain outbox; reconcile processed IDs before replay | Counts, idempotency keys and deterministic replay |
| Prisma migration | Migration, performance or compatibility failure | Stop rollout before old readers are removed | Forward-fix or reversible compatibility migration; restore only in isolated disaster scenario | Old/new reader tests plus backup restore |
| Runtime manager | Start/delete/reattach or isolation regression | Flip scoped runtime flag to previous manager/image/topology | Preserve WorkspaceRuntime and PVCs; reconcile orphan objects | Workspace files, pod identity, terminal and preview checks |
| AI gateway | Provider, billing or cancellation regression | Route selected orgs back to previous gateway/client | Keep AgentRun history; mark incomplete runs explicitly | Usage and billing reconciliation |
| Connector broker | Token/exfiltration/provider regression | Disable broker route and revoke broker-scoped credentials | Preserve encrypted connections; never return token to browser | Negative cross-user and revocation tests |
| Config/secrets | Startup failure or denied required call | Roll back one service config version | Rotate any secret exposed to the wrong service | Config hash, pod env-source and network checks |
| NetworkPolicy | Required traffic denied or unintended egress allowed | Apply last known policy bundle by content hash | None | Positive required flow and negative forbidden flow |
| Image/deployment | Readiness, content or digest mismatch | Helm rollback to recorded revision and pinned digest | Run compatibility checks before accepting old app | Resource, endpoint, response content, logs and digest |
| Nix generation | Catalog drift, revoked key or poisoned bundle | Mark generation REVOKED and select retained prior generation | Preserve old store/PVC until active workspaces drain | Catalog hash, signature and real language fixtures |
| Physical data split | Shadow mismatch, replication lag or failure | Stop cutover and route reads/writes to source owner | Retain target copy; reconcile rather than delete | Row/object counts, checksums and restore |

## Database procedure proposal

Before any schema change:

- take and identify a restorable test backup;
- run migration from an empty database and a representative previous version;
- prove old and new application binaries can read the expand phase;
- record migration SQL hash and transaction behavior;
- test interruption and rerun.

Use expand/migrate/contract:

1. add compatible schema;
2. deploy code capable of both representations;
3. backfill idempotently with progress checkpoints;
4. shadow-read and reconcile;
5. switch authoritative read;
6. keep rollback representation for a bounded window;
7. contract only after restore and counter-audit.

A production rollback must not run a destructive down migration by default.

## Kubernetes/runtime procedure proposal

- Record Helm revision, rendered manifest hash, workload image digests and runtime
  workspace-agent image before upgrade.
- Canary by organization or project.
- On failure, stop new workspace starts first; do not delete existing PVCs.
- Roll back manager/API/agent contracts as a compatible set.
- Reconcile WorkspaceRuntime rows against pods, Services, Deployments, Ingress and PVCs.
- Verify a pre-existing workspace can reconnect, edit, run, open terminal and preview.
- Verify an unauthorized workspace remains inaccessible.

The current repository deploy command uses Helm atomic upgrade, but this plan still
requires a real test-cluster exercise.

## Secrets and connector rollback

- Never re-enable browser-held long-lived provider tokens as a permanent rollback.
- Temporary compatibility paths require a short expiry, explicit organization scope and
  audit event.
- Rotate shared credentials if a new service received a secret it should not own.
- Revoke provider tokens before deleting connection records.
- Test that cached credentials stop working after revocation.

## Abort criteria

Abort or roll back a canary on:

- inter-tenant access;
- missing or duplicate ledger entry;
- lost project file or PVC;
- digest/content mismatch;
- fail-open secret, private-port or authorization path;
- non-idempotent destructive retry;
- unbounded queue/retry storm;
- inability to restore the test database;
- any required suite skipped or running against another SHA.

## Evidence package

Each exercise must retain command, timestamp, base/result SHA, environment identifier,
resource identifiers, raw stdout/stderr, before/after state, endpoint response, logs,
configuration hash, image digest, database/object checksums, cleanup observation and
artifact SHA-256. A separate reviewer recalculates the hashes before any proven verdict.

