# E-Code Gate 1 Disaster Recovery Report

## Audit identity and decision

| Field | Value |
|---|---|
| Repository | `openaxcloud/vibecore` |
| Audited code commit | `8a93e995b37de513a142acaf41fed364787c5e4e` |
| Audit gate | Gate 1, read-only source audit |
| Decision | **NOT_READY** |
| Recovery proof status | **BLOCKED / IMPLEMENTED_UNPROVEN** |
| Signed status | **No restore, rollback, RTO or RPO is `SIGNED_PROVEN` by this report** |

The repository contains recovery designs, local checksum/tamper tests, Kubernetes resilience manifests and a production deployment/Helm rollback runbook. It does not contain an exact-commit execution report proving recovery of real PostgreSQL, PVC, GCS and deployment artifacts with measured RTO/RPO.

The operational deployment source of truth remains [`docs/DEPLOY_RUNBOOK.md`](../DEPLOY_RUNBOOK.md). That document describes how to build, deploy, inspect and Helm-rollback production. A Helm rollback is not a database, PVC or object-storage restore, and neither operation proves the other.

## Current deployed architecture described by the repository

According to `docs/DEPLOY_RUNBOOK.md`, the production path is:

```text
push main
  -> .github/workflows/deploy-main.yml
  -> regional Cloud Build
  -> service images tagged with short source SHA
  -> helm upgrade --reuse-values --atomic
  -> GKE platform services behind ingress-nginx
```

The runbook records GKE in `europe-west9`, Helm release/namespace `vibecore`, ingress-nginx and direct DNS. It also states there is no GitOps reconciler. This report did not query or change that production environment.

The data plane represented in source includes:

- PostgreSQL/Prisma for identity, organizations, projects, workspaces, deployments, billing, audit, agent and lifecycle state;
- Redis for shared collaboration fan-out and other cache/coordination behavior;
- Kubernetes workspace pods and PVC-backed project files;
- GCS-backed per-project object storage and signed URLs;
- static deployment snapshot directories and server image registry artifacts;
- release manifests/digests in PostgreSQL;
- external Stripe, identity, Git, model, email, SIEM, webhook and MCP systems;
- in-process state for selected caches and import staging/billing maps.

## Recovery objectives currently documented — not measured

`docs/DISASTER_RECOVERY.md` currently states:

| Data/service class | Documented RTO | Documented RPO | Gate 1 status |
|---|---:|---:|---|
| API | 1 hour | 15 minutes | **UNVALIDATED** |
| Project metadata | 2 hours | 15 minutes | **UNVALIDATED** |
| Snapshot/object storage | 4 hours | 1 hour | **UNVALIDATED** |

These are existing design objectives, not observed results or accepted commitments. They require validation against the real backup configuration, dataset size, dependency graph, operator procedure, DNS/ingress recovery and critical user journeys. No objective is assigned here for active PVC files, billing ledger/webhooks, secrets/configuration, agent memory/indexes, Redis collaboration state, registry artifacts or a full regional loss; those classes must be explicitly decided before adoption.

## Data and recovery ownership matrix

| Data/resource | Source of truth | Recovery method represented | Integrity check required | Current proof |
|---|---|---|---|---|
| Identity, org, project and authorization metadata | PostgreSQL | PITR/backup restore to isolated database | schema version, FK/tenant counts, authorization canaries | **BLOCKED** |
| Billing ledger, credits, usage and Stripe event state | PostgreSQL plus Stripe as external evidence | PostgreSQL restore plus Stripe replay/reconciliation | balanced ledger, unique entitlement, invoice/event reconciliation | **BLOCKED; P0 atomicity gaps exist** |
| Workspace lifecycle and operation state | PostgreSQL + Kubernetes | DB restore then manager reconciliation | no duplicate/orphan workload; monotonic lifecycle | **BLOCKED** |
| Active project files | PVC/workspace filesystem | volume snapshot/backup or project snapshot restore | file manifest, byte hashes, symlink/permission semantics | **BLOCKED** |
| Project objects, thumbnails, exports and snapshots | GCS | object version/backup/replication restore | object inventory, generation/hash, lifecycle/legal hold | **BLOCKED** |
| Static deployment snapshots | API filesystem/artifact storage as implemented | retained snapshot copy/restore | digest of final destination bytes | **BROKEN P0 on rollback ordering/fallback** |
| Server deployments | Registry image plus release manifest | redeploy retained image digest | registry digest, signature, provenance, endpoint content | **IMPLEMENTED_UNPROVEN** |
| Secrets | Encrypted PostgreSQL rows plus KMS/config key and runtime references | restore encrypted rows and authorized key material | decrypt canary without logging value; rotation/version compatibility | **BLOCKED** |
| Redis collaboration/pub-sub state | Redis, largely ephemeral | reconnect/resync/rebuild | collaboration ordering/resync contract | **PARTIAL; outage degrades local-only** |
| Agent conversations, memory, checkpoints and indexes | PostgreSQL/object/index services depending feature | restore source records, rebuild derived index | tenant scope, HEAD/index consistency, deletion retention | **BLOCKED** |
| Configuration, Helm release and Kubernetes manifests | Git, GitHub Actions, Helm stored values, live cluster | chart redeploy or Helm rollback | full source SHA, values diff, image digests, policy inventory | **PARTIAL** |
| Audit, logs, metrics and traces | PostgreSQL/observability backends | backend-specific backup/retention | continuity, immutability, correlation, no secret | **UNKNOWN** |
| In-process caches/import staging | Process memory | reconstruct or resume from durable state | no lost job, duplicate effect or stale authority | **BROKEN/PARTIAL for import and billing paths** |

## Evidence presently available

### Useful repository-local controls

- `scripts/backup-restore-dry-run.mjs` creates a local project fixture, manifest, encrypted archive, restore, checksum comparison and tamper rejection.
- `docs/BACKUP_RESTORE.md` describes an intended isolated PostgreSQL/object/PVC restore sequence.
- `docs/DISASTER_RECOVERY.md` lists a regional-failure procedure and critical journey checks.
- `.github/workflows/deploy-main.yml` uses Helm `--atomic`, waits for rollouts and verifies a rollback feature flag.
- `docs/DEPLOY_RUNBOOK.md` documents Helm history/rollback and workload verification commands.
- Workspace manifests include probes, limits and pod/runtime security controls.
- Release manifest and retained server-image digest code exists.

### What the local dry-run does not prove

The script uses temporary local directories and a generated local encryption key unless configured. It does not prove:

- PostgreSQL backup freshness, WAL/PITR, restore duration, migrations or tenant integrity;
- Kubernetes volume snapshot creation, zonal attachment or restored PVC behavior;
- GCS object generations, pagination, missing objects, lifecycle or signed URL behavior;
- secret/key-management restore and rotation;
- Redis collaboration resync;
- registry image retention/signature/provenance;
- ingress/DNS/TLS recovery;
- critical user journeys after recovery;
- operator access, alert delivery or incident coordination.

Passing `pnpm sre:validate` or the local script must therefore remain repository-local evidence only.

## Critical integrity blocker: application rollback

Static rollback currently:

1. verifies the previous **source** snapshot digest;
2. restores/copies it to a new deployment;
3. marks the new deployment `READY`;
4. calculates the destination digest afterward;
5. substitutes the source digest if destination digest calculation fails.

Evidence: `services/api/src/app.ts:33265-33352`. General release-manifest append is best-effort after READY and errors are swallowed (`services/api/src/app.ts:6644-6726`).

This means rollback cannot be signed as a recovery control: restored bytes may be served before their final digest is durably proven. `PLAN_REMAINING_UNIFIED.md:42-44` records earlier rollback stages as tested, but the current exact-SHA invariant requires reconciliation. The unmerged `fix/deploy-rollback-integrity@b0690bfe1a137912fa39cc1c21ba6c50740acdb3` is candidate work, not proof for audited `main`.

Required ordering:

```text
restore to non-serving destination
  -> apply all transformations
  -> compute destination digest
  -> compare/validate intended manifest policy
  -> durably commit VERIFIED release manifest
  -> atomically transition deployment to READY/serving
```

An interrupted step must remain `PENDING`/`FAILED` and be reconciled; it must never fall back to a digest computed from different bytes.

## Failure scenario assessment

| Scenario | Expected recovery | Repository controls | Gate 1 reserve / required drill |
|---|---|---|---|
| One platform pod loss | Kubernetes reschedules; readiness removes failed pod | probes and Deployments represented | Kill each service while traffic runs; prove no lost/duplicate non-idempotent effect |
| Bad application release | Helm atomic rollback or explicit prior revision rollback | `deploy-main.yml`; `docs/DEPLOY_RUNBOOK.md` | Real test release with exact image digest set, content and config verification |
| Bad database migration | Stop writers, rollback-compatible app or restore to isolated DB | prose only; no exercised migration rollback report | Forward/backward compatibility matrix, old-copy migration, restore and app rollback |
| PostgreSQL outage | Fail readiness, stop destructive/non-idempotent work, recover or PITR | `/ready` probes DB | Kill/restrict DB, observe queues/retries, restore and reconcile every incomplete effect |
| PostgreSQL logical corruption/deletion | PITR to pre-corruption point, reconcile external effects | DR prose | Multiple PITR points around billing, deletion, deployment and migration events |
| Redis outage | Degraded readiness or safe resync after recovery | API readiness checks Redis; collaboration catches errors | Two replicas; prove no silent split-brain, retry storm or lost ordering |
| Workspace pod loss | Manager recreates/reattaches persistent workspace | manager/runtime state machine represented | Kill during save, terminal process, preview, agent tool and snapshot; verify files/process policy |
| Node loss | Reschedule within capacity, attach accessible volume | Kubernetes scheduling/manifests | Drain/kill node under concurrent starts; measure cold path and orphan cleanup |
| Zone loss | Reschedule/fail over compatible compute and data | historical tracker claims exist | Repeat exact-SHA on dedicated environment; verify PVC topology and DB/storage dependency |
| Manager loss | New manager resumes durable operations idempotently | reconciliation code exists in areas | Kill at every workspace create/start/stop/delete boundary; verify no duplicate workload/secret |
| GCS outage | Fail operations explicitly, retry idempotently, restore/reconcile objects | GCS adapter; no durable operation saga | Fail upload/list/move/purge, >1000 objects, outage during account/project purge |
| PVC inaccessible/disk full | Surface blocked state; restore/snapshot or operator action | resource manifests | Fill disk, deny attach, restore volume and verify byte manifest |
| Registry/image unavailable | Keep prior healthy release, retain required digests | Helm atomic and release digest structures | Delete/block candidate image, then previous tag; prove retained digest and signature path |
| Ingress/DNS/TLS loss | Restore routing/certificates, verify all hosts and WS/SSE | ingress manifests/runbook | Real ingress-nginx, DNS override/test domain, TLS/WS/SSE/large response checks |
| Model/provider outage or rate limit | Bounded retry/fallback or explicit failure without double charge | provider routing/retry structures | 429, timeout, partial stream, fallback and cancellation with billing reconciliation |
| Stripe unavailable/duplicate delivery | Durable pending event and idempotent replay | signature and event dedup code | P0 partial-failure/concurrency issue must be fixed, then Stripe test-mode drill |
| Queue blocked/poison job | Bound retries, terminal dead-letter state, continue other jobs | cron/worker code represented | Poison one job, kill worker, restart and verify backlog age plus no duplicate effects |
| Account/project deletion interruption | Resume from durable fence/receipts | only intent/DB delete currently | Build deletion saga; kill each phase; verify external absence before `PURGED` |
| Regional loss | Rebuild platform and restore data in approved recovery region | DR prose only | Architecture decision, replicated backups, quotas/IAM/DNS, full timed exercise |

## Recovery consistency groups

Restoring each store independently can produce a syntactically healthy but incorrect platform. The recovery design must define consistency groups:

### Identity and tenant authority

- User, organization membership, role/custom permission, project ownership, sessions/API keys and audit state.
- On restore, revoke sessions/keys created after RPO as policy requires; do not let an old membership resurrect access silently.
- Re-run last-owner and tenant-isolation assertions before traffic.

### Project, workspace and storage

- Project metadata, workspace lifecycle, PVC bytes, snapshots and GCS objects.
- A restored DB row must not claim a workspace, object or snapshot generation that is absent.
- Manager reconciliation must distinguish missing workload, retained volume and deleted project generation.

### Deployment release

- Deployment row, release manifest, configuration digest, secret policy/reference, static snapshot or server image digest, domain/TLS route.
- Promotion is forbidden until artifact digest/signature and endpoint content pass.
- Rollback does not reverse a database migration unless a separate compatible data recovery plan says so.

### Billing and external events

- Stripe event/effect state, subscription, credits, packs, usage, ledger entries, invoices and external Stripe objects.
- After PITR, Stripe may replay events committed externally after the restored point. Database uniqueness and effect state must make replay safe.
- Reconcile balances and entitlements before re-enabling paid workloads.

### Agent and derived indexes

- Project HEAD/files, conversation/messages, agent runs/checkpoints, memory source records and search/embedding indexes.
- Derived indexes must be rebuilt or invalidated against restored HEAD; old vectors must not expose deleted/newer branch content.

## Proposed recovery phases

1. **Declare and fence**
   - assign incident commander and recovery owner;
   - freeze deploys, destructive jobs, purges, metering windows and external writes that cannot be safely replayed;
   - record incident start, observed last-good timestamps, full SHA, image digests and Helm revision.
2. **Preserve evidence**
   - snapshot affected logs, metrics, audit, database metadata, object generations and Kubernetes state;
   - do not destroy the failed environment before evidence and restore points are identified.
3. **Select recovery point**
   - choose PostgreSQL PITR and storage/volume generations as a consistency decision, not independently by newest timestamp;
   - calculate potential lost/duplicated external effects.
4. **Restore in isolation**
   - restore PostgreSQL to a new instance/database;
   - restore/attach copies of PVC and GCS data;
   - deploy exact signed image digests and configuration to an isolated namespace/domain.
5. **Validate integrity**
   - migrations/schema, FK and tenant counts;
   - ledger balance and Stripe reconciliation;
   - file/object/release manifest hashes;
   - secret decrypt canary without value disclosure;
   - audit continuity and derived-index invalidation.
6. **Run critical journeys**
   - auth and organization authorization;
   - project open, file edit, terminal, runtime, preview;
   - agent read/edit/test under correct permission mode;
   - object upload/download and database query;
   - deployment, exact-content probe and rollback;
   - signed billing webhook replay.
7. **Promote gradually**
   - canary test identities/organizations first;
   - reopen reads before writes only if the application contract supports it;
   - monitor errors, queues, duplicate effects and cost.
8. **Reconcile and close**
   - reconcile external effects after RPO;
   - rotate potentially exposed credentials;
   - prove cleanup only after recovery evidence is captured;
   - record measured RTO/RPO and independent review.

## Required restore drills

### DR-DB-01 — PostgreSQL PITR and application compatibility

- Create a real ephemeral database with representative old schema/data.
- Record operations before and after several PITR markers: membership change, project save, billing event, deployment manifest and deletion request.
- Apply current migrations and workload, introduce logical corruption, restore to isolated DB.
- Verify tenant boundaries, schema, balances, incomplete effects and newer external Stripe events.
- Record raw backup/PITR configuration, restore timestamps, DB size, WAL position, checks and cleanup.

### DR-STORAGE-01 — PVC and object storage

- Build a project with source files, symlink/permissions if supported, more than 1,000 GCS objects, snapshot, thumbnail, export and active signed upload.
- Snapshot/backup, mutate/delete, then restore to new PVC/buckets/prefixes.
- Compare byte manifest and object generation/hash inventory.
- Inject one missing/corrupt object and prove promotion refuses the restore.
- Observe resource absence/presence before teardown; teardown itself is not proof.

### DR-RUNTIME-01 — Pod, manager, node and zone

- Run file save, terminal command, preview and agent action while killing the workspace pod.
- Kill the manager during create/start/stop/delete and verify durable resumption.
- Drain/lose a node; verify capacity, volume topology and cold-start metrics.
- Run an approved test-zone loss only in dedicated infrastructure and verify no split-brain workload.

### DR-RELEASE-01 — Deploy and rollback integrity

- Publish v1 and v2 from exact immutable digests.
- Remove the v1 live revision while retaining its artifact.
- Roll back into a non-serving destination, compute destination digest, commit manifest, then serve.
- Inject snapshot corruption, digest failure, manifest failure and process death; every case must remain non-serving.
- Verify external endpoint content, logs, configuration, imageID and rollback manifest.

### DR-BILLING-01 — External replay and ledger reconciliation

- Deliver valid Stripe test-mode events before and after the DB recovery point.
- Restore the DB, replay duplicates and reordered events.
- Inject failure after credit entitlement creation and before acknowledgement.
- Verify exactly one entitlement, balanced ledger, correct subscription, usage and invoice reconciliation.

### DR-COLLAB-01 — Redis and connection recovery

- Two API replicas and two collaborators on different replicas.
- Stop Redis during simultaneous edit/comment/presence.
- Restart Redis/API clients, exercise resync and verify declared CRDT/OT/locking/LWW semantics.
- Measure loss, duplicates, ordering, reconnect schedule and user-visible degraded state.

### DR-REGION-01 — Full environment reconstruction

- Requires an approved recovery-region architecture, pre-created quotas/IAM/DNS plan and replicated backups.
- Rebuild Kubernetes policy, platform services, workspace runtime and observability from versioned infrastructure.
- Restore consistency groups, route a test domain, run the complete critical journey and record measured RTO/RPO.
- Do not modify production DNS or use production secrets for this Gate.

## RTO/RPO measurement rules

- **Incident start:** first objective loss/corruption timestamp, not when an operator opens a ticket.
- **RTO end:** scoped user journey is externally usable with expected content and authorization, not when a pod becomes Ready.
- **RPO:** difference between last acknowledged durable user/external operation and newest correctly recovered operation, established by canary records and external reconciliation.
- Report p50/p95 only after repeated comparable drills; a single drill reports one observed duration, not a percentile.
- Separate detection, decision, restore, validation and traffic-promotion durations.
- Report dataset size, object count, WAL interval, PVC size, image size, network and operator actions.
- Any manual undocumented step invalidates the runbook automation claim but remains valuable evidence.

## Evidence manifest required for every drill

```yaml
schemaVersion: 1
drillId: DR-...
codeCommit: 8a93e995b37de513a142acaf41fed364787c5e4e
documentationCommit: <full-sha>
imageDigests: {}
helmRevision: <test-revision>
infrastructure:
  cluster: <ephemeral-id>
  database: <ephemeral-id>
  buckets: []
startedAt: <timestamp>
detectedAt: <timestamp>
restorePoint: <timestamp-or-lsn>
trafficRestoredAt: <timestamp>
observedRtoSeconds: <number>
observedRpoSeconds: <number>
commands: []
assertions:
  positive: []
  negative: []
  concurrency: []
  failure: []
rawArtifacts: []
sha256sums: {}
absenceObservedBeforeTeardown: false
teardown: []
reviewer: <independent-reviewer>
verdict: PROVEN_REVIEW_PENDING
```

`SIGNED_PROVEN` is forbidden until independent review reruns the drill from the exact commit and validates raw artifacts.

## Runbook coverage required

The following operational runbooks must point to real dashboards/alerts and contain detection, authority, safe commands, rollback, verification and escalation:

- workspace stuck in create/start/stop/delete;
- workspace pod/node/zone loss and PVC attach failure;
- PostgreSQL outage, corruption and PITR restore;
- Redis outage and collaboration split-brain/resync;
- queue blocked or poison job;
- deployment stuck, bad release, artifact missing and digest mismatch;
- failed migration and incompatible rollback;
- GCS outage, incomplete purge and object restore;
- billing webhook backlog, duplicate entitlement and ledger discrepancy;
- compromised secret/provider key and rotation;
- cross-tenant or sandbox escape incident;
- AI provider outage/rate limit and cost runaway;
- regional rebuild and DNS/TLS promotion.

`docs/DEPLOY_RUNBOOK.md` covers the current app-image deployment and Helm rollback path. It should be referenced rather than duplicated, then augmented by the data and failure runbooks above.

## Tracker reconciliation

No tracker was edited by this report.

- `PLAN_REMAINING_UNIFIED.md` contains historical live rollback and zone-loss evidence. Those artifacts must be re-evaluated against the audited commit and current integrity invariants before reuse.
- `docs/parity/IMPLEMENTATION_STATUS.yaml` is generated and records evidence/commit fields; it must not be hand-edited.
- `REPLIT_PARITY.md` may mark a recovery capability complete only after code is on `main` and exact-SHA live restore passes.
- `BUG_INVENTORY_LIVE.md`, `DESIGN_PROGRAM_MASTER.md` and `DESIGN_AUDIT_LIVE.md` retain their separate dispatch/coded/live states.

## Dependencies blocking proof

- real ephemeral PostgreSQL with PITR/backup capability;
- Kubernetes test cluster with persistent volumes, controllable nodes and network policy;
- real ephemeral GCS buckets and version/inventory support;
- Redis and at least two API replicas;
- ingress-nginx and test DNS/TLS domain;
- image registry plus signing/admission test policy;
- Stripe test-mode account/CLI and test webhook endpoint;
- test identities, organizations and fixtures;
- non-production alert receiver and evidence storage.

No costly cloud resource or production secret should be provisioned without separate authorization.

## Final Gate 1 verdict

The repository shows serious recovery intent and useful local integrity controls, but **backup existence is not restored-service proof**, **Helm rollback is not data restore**, and the current static rollback ordering contains a P0 integrity defect. Real PostgreSQL/PVC/GCS recovery, external-event reconciliation, runtime failure recovery and measured RTO/RPO remain blocked.

Decision: **NOT_READY**. The next valid state after implementation and exact-SHA drills is `PROVEN_REVIEW_PENDING`; `SIGNED_PROVEN` requires an independent counter-audit.
