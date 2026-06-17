# Database Point-in-Time Rollback — Architecture (Phase 2)

> Replit-parity feature: every project gets a managed Postgres database, and Pro
> plans can roll it back to any point in the last **28 days**. Phase 1 (schema +
> entitlement service + dormant endpoints + UI shell) is live and inert behind
> `DB_ROLLBACK_ENABLED=false`. This document specifies Phase 2 — the real
> provisioning + snapshot + point-in-time restore — and the option chosen.
>
> **Nothing in Phase 2 runs until Avi flips `DB_ROLLBACK_ENABLED=true`.** Until
> then every provisioner call is a no-op, no Postgres is created, and there is no
> cost. Avi reviews this doc and approves the operator install before the flip.

## What "point-in-time recovery" requires

PITR = a base backup + a continuous stream of write-ahead-log (WAL) segments
archived to durable storage. To restore to time *T*, you restore the most recent
base backup taken before *T* and replay WAL up to *T*. So any option must give us:
(1) per-project isolated Postgres, (2) continuous WAL archive to object storage,
(3) restore-to-timestamp, (4) 28-day retention, (5) teardown on project delete.

## The three options (costed)

Assumptions: ~1,000 active project DBs at steady state, mostly tiny (<1 GiB),
GKE already running (app cluster `e2-standard-4`, workspaces cluster
`e2-standard-8`), a GCS `…-backups` bucket already provisioned with lifecycle
rules, `k8s-client.apply()` can create arbitrary CustomResources.

### Option 1 — CloudNativePG operator on the existing GKE  ⟵ **RECOMMENDED**

Install the [CloudNativePG](https://cloudnative-pg.io) operator once in the app
cluster. Each project DB is a `postgresql.cnpg.io/v1` `Cluster` CR we create via
the existing `k8s-client.apply()`. CNPG natively does continuous WAL archiving +
base backups to an object store (Barman Cloud → GCS), and restore-to-timestamp by
bootstrapping a **new** `Cluster` with `bootstrap.recovery` +
`recoveryTarget.targetTime`. Retention is a CNPG `retentionPolicy` (`28d`).

- **Provisioning:** `k8s-client.apply(clusterManifest)` — one CR per project, in a
  dedicated `project-databases` namespace, labelled `vibecore.ai/project-id`.
- **WAL/backups:** CNPG `.spec.backup.barmanObjectStore` → the existing GCS
  backups bucket, path `db/<projectId>/`. Continuous WAL + scheduled base backup.
- **Restore:** create `Cluster <project>-restore-<ts>` with
  `bootstrap.recovery.source` = the project's backup + `recoveryTarget.targetTime
  = T`; once healthy, swap the connection secret to point the project at it
  (or promote/rename). The executor drives this state machine.
- **Connection:** CNPG publishes a `-app` Secret (host/user/password/dbname); we
  copy it into the project's `ProjectSecret` as `DATABASE_URL` via the existing
  injection path.
- **Cost:** marginal. Runs on the GKE we already pay for (pack many small DBs per
  node; CNPG supports tiny resource requests). Storage = a small PVC per DB +
  GCS backup bytes (≈ pennies/GiB-month, lifecycle already prunes). **No
  per-instance cloud floor.** Rough: 1,000 tiny DBs ≈ 2–4 extra `e2-standard-4`
  nodes (~$200–400/mo) + GCS (~tens of $/mo). Scales with real usage.
- **Pros:** cheapest at scale, full control, native PITR, uses primitives we
  already have (`k8s-client.apply`, GCS bucket, secret injection). One operator
  to install (`kubectl apply -f` the CNPG manifest, or Helm).
- **Cons:** we operate Postgres (the operator does the hard parts, but node
  capacity/upgrades are ours). Operator must be installed before the flip.

### Option 2 — Cloud SQL instance per project

One `google_sql_database_instance` per project (Terraform-driven from a
controller reconciling `DatabaseInstance` rows). Native PITR is already proven on
our platform DB (`point_in_time_recovery_enabled = true`).

- **Cost:** **a hard per-instance floor.** The smallest Cloud SQL Postgres
  (db-f1-micro / shared-core) is ~$8–10/mo *each, idle*. 1,000 project DBs ≈
  **$8k–10k/mo minimum** regardless of usage, plus storage/backups. Dollars don't
  scale to zero for idle free-tier projects.
- **Pros:** fully managed, native PITR, zero Postgres ops, Workload-Identity
  connection already used by the platform.
- **Cons:** cost floor is prohibitive for a Replit-style free tier with many idle
  DBs; provisioning latency (minutes) per instance; GCP quota on instances/IP.

### Option 3 — Neon-style external managed Postgres (branching)

Use a serverless Postgres provider (Neon/Nile/etc.) with copy-on-write branches.
PITR is instant (branch from a timestamp); scale-to-zero for idle DBs.

- **Cost:** usage-based; attractive for idle-heavy free tier, but it's an
  **external dependency** (data residency, vendor lock-in, egress, a second
  billing relationship, SOC/compliance review). Per-branch/compute pricing can
  exceed Option 1 at high active-DB counts.
- **Pros:** instant PITR, scale-to-zero, no Postgres ops, no operator.
- **Cons:** new third-party processor (privacy/legal review), network egress from
  GKE, less control, lock-in. Conflicts with the "cost-first, in-cluster" posture
  the rest of the platform takes.

## Recommendation: **Option 1 (CloudNativePG)**

It matches the platform's existing cost-first, in-cluster, GCS-backed posture; it
reuses the exact primitives we already have (`k8s-client.apply`, the provisioned
backups bucket, the project-secret injection path); it has **no per-instance cost
floor** (critical for a free tier with many idle DBs); and PITR + 28-day
retention are first-class CNPG features. Option 2's cost floor rules it out at
Replit scale; Option 3 adds an external processor we'd rather avoid.

The only new operational dependency is installing the CNPG operator in the app
cluster — a one-time `helm install cnpg` / `kubectl apply`, done **only when Avi
approves the flip**.

## Phase 2 implementation (all behind `DB_ROLLBACK_ENABLED`, dormant)

Layered so each piece is testable with a mocked k8s client and inert while the
flag is off:

1. **`database-provisioner.ts`** (pure manifest builders + a thin client):
   `buildClusterManifest(projectId, …)`, `buildScheduledBackupManifest(…)`,
   `buildRestoreClusterManifest(projectId, targetTime, …)`,
   `buildBarmanObjectStore(projectId)` → GCS backups bucket path. A
   `DatabaseProvisioner` interface with a `CnpgProvisioner` impl (calls
   `k8s-client.apply/get/delete`) and a `NoopProvisioner` (used when the flag is
   off and in tests). `resolveProvisioner()` returns Noop unless
   `DB_ROLLBACK_ENABLED==='true'`.
2. **Provision on first use:** when a project's workspace starts (or on an
   explicit "Add database" action), if the flag is on and no `DatabaseInstance`
   row exists, create one (`PROVISIONING`), apply the Cluster CR, poll to
   `ACTIVE`, copy the `-app` secret into the project's `DATABASE_URL`.
3. **Snapshot executor:** `POST /projects/:id/database/snapshots` creates a CNPG
   on-demand `Backup` CR + a `DatabaseSnapshot` row; the daily scheduler also
   takes one and prunes snapshots/rows past `retentionDays`.
4. **Restore executor:** `POST /projects/:id/database/restores` validates the
   target against the plan window (already done in Phase 1), creates a
   `DatabaseRestore` row (`PENDING`), and the executor applies a recovery Cluster
   with `recoveryTarget.targetTime`, polls to healthy, repoints the project
   secret, marks `COMPLETED`. State machine: `PENDING → RUNNING →
   COMPLETED/FAILED`.
5. **Scheduler:** a worker cron (`database.maintenance`) that, when the flag is
   on, takes daily base backups and prunes expired snapshots — mirrors the
   existing `inactivity.gc` / `metering.objectStorage` cron pattern.
6. **UI:** the dormant `DatabaseRollbackPanel` (already mounted in the IDE
   Database→Backups tab) becomes functional — list recovery points, "Restore to a
   point in time", and surface restore status. It already self-hides when the
   backend 404s (flag off).
7. **Teardown:** on project delete, delete the Cluster CR + backups path.

### Safety / dormancy guarantees

- Every provisioner method is a no-op unless `DB_ROLLBACK_ENABLED==='true'`; the
  default `NoopProvisioner` makes Phase-2 code inert and free.
- The endpoints already 404 (`FEATURE_NOT_ENABLED`) while the flag is off.
- No CNPG operator is installed until Avi approves → even a mis-flip can't create
  Postgres (the `apply` would fail on a missing CRD, surfaced as a provisioning
  error, not a charge).
- Migrations (0040 tables) are additive and already shipped dormant.

### Operator install runbook (executed only at go-live, by Avi/operator)

1. `helm repo add cnpg https://cloudnative-pg.github.io/charts && helm install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace`
2. Create namespace `project-databases` + a GCS HMAC/Workload-Identity binding for
   the CNPG service account to write the backups bucket path `db/`.
3. Set `DB_ROLLBACK_ENABLED=true` in the platform configmap; redeploy.
4. Smoke-test on one throwaway Pro project: provision → write rows → snapshot →
   restore to a timestamp before the writes → verify rows gone.

*Authored 2026-06-17. Phase 2 implemented dormant against Option 1.*
