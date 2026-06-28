# Database & App-Storage architecture v2 — cost-optimized (shared multi-tenant)

> Supersedes the per-project-cluster approach in `DB_PITR_ARCHITECTURE.md`. That model
> (one CNPG `Cluster`/Postgres pod per project, running 24/7) is **ruinous at scale**
> (~$15–30/mo/project just for the pod+PVC → ~$15–30k/mo at 1000 projects). This v2
> replicates Replit's economics: many projects share a few clusters.

## Decision (validated LIVE on prod app cluster, 2026-06-28)

**One small pool of shared CNPG clusters; each project = an isolated logical database
via the CNPG `Database` CRD (operator 1.29), with its own owner role.**

Proven live before adopting:
- Shared `Cluster` + two `Database` CRs (`proj_a_app` owner `tenant_a`, `proj_b_app`
  owner `tenant_b`) → both `APPLIED=true` on the **same** cluster.
- `tenant_a` connects to `proj_a_app`, DDL/DML OK.
- After `REVOKE CONNECT ON DATABASE proj_b_app FROM PUBLIC`, `tenant_a` → `proj_b_app`
  = `FATAL: permission denied for database`. **Tenant isolation works at the DB level.**

## Components

1. **Shared CNPG clusters** (`project-databases` ns): start with 1 HA cluster
   (2–3 instances, e.g. 2 vCPU / 4–8 Gi each); shard to more clusters as tenant
   count grows (cap ~few-hundred DBs/cluster). A "placement" picks the least-loaded
   cluster for a new project.
2. **Per-project logical DB**: `Database` CRD → db `proj_<id>` owned by role
   `t_<id>` (CNPG `managed.roles`, password in a Secret). Isolation =
   `REVOKE CONNECT … FROM PUBLIC` + `GRANT CONNECT … TO t_<id>` + per-DB schema.
3. **PgBouncer Pooler** (CNPG `Pooler`, `transaction` mode) in front of each shared
   cluster → hundreds of app connections collapse onto a small backend pool.
   `DATABASE_URL` points at the Pooler service, db `proj_<id>`, user `t_<id>`.
4. **Hibernation / scale-to-zero** (Neon/Replit-style): a reconciler tracks
   per-tenant last-activity; idle dev DBs are "paused" (drop pooler entry / mark
   dormant). First query wakes them. Inactive **shared clusters** in non-prod can be
   scaled to 0 instances via CNPG hibernation annotation. Backups persist while paused.
5. **Backups + PITR** (Barman → GCS, WI already wired): continuous WAL + scheduled
   base backups at the **cluster** level (shared across its tenant DBs) to
   `gs://…-prod-backups/db/<cluster>/`; retention 7d/28d by plan. PITR = recover the
   cluster to a timestamp into a recovery cluster, then pull the one tenant DB.
6. **Dev vs Production DBs** (Replit parity): the agent only ever touches the **dev**
   logical DB. On **publish**, the dev schema is applied to a **prod** logical DB
   created at publish (optional "copy dev data"); prod is not agent-writable.
   **Deployment preview** = a throwaway clone of prod to test schema changes pre-go-live.
7. **`DATABASE_URL` injection**: app-scoped project secret (Pooler host + db + role),
   never exposed publicly; consumed by the workspace + the SQL panel.
8. **External DBs (keep bolt integrations)**: the Database panel offers TWO paths —
   **Native (CNPG)** and **Connect external** (Supabase / Neon / any Postgres via
   connection string) using the existing bolt connector flow.

## App / object storage (GCS — native, like Replit)

- Per project = a **dedicated prefix in a shared regional bucket** (uniform
  bucket-level access; lifecycle rules: auto-delete temp, nearline/coldline for cold
  data; signed URLs for sharing). Workload Identity already configured.
- API + JS/Python SDK for generated apps: create/list/delete logical bucket(s),
  upload/download/move/delete objects + folders, get bucket id, cross-project share.

## Cost estimate (order of magnitude)

| Model | Per-project run cost | 1000 projects |
|---|---|---|
| v1 per-project cluster | pod+PVC 24/7 ≈ **$15–30/mo** | **$15–30k/mo** |
| v2 shared + logical DB + hibernation | (cluster ≈ $150–300/mo) / ~200 DBs + storage ≈ **$1–2/mo** | **~$1–2k/mo** |

→ **~10–20× cheaper**, and hibernation cuts idle dev further. Object storage is
marginal (GCS standard ≈ $0.02/GB-mo + ops).

## Phases (gated; operator already installed + WI + bucket from Phase 1)

- **P2a** Provisioner rewrite: shared-cluster placement + `Database` CRD + managed
  role + REVOKE/GRANT isolation + Pooler; `DATABASE_URL` (Pooler) injection. *(replaces
  the per-project Cluster path in `services/api/src/database-provisioner.ts`)*
- **P2b** SQL/data API for the panel (tables/columns/rows, SQL runner, row CRUD,
  schema, usage) + NetworkPolicy api↔pooler.
- **P2c** Hibernation reconciler + backups/PITR at cluster scope.
- **P2d** Dev/prod split + publish flow + deployment-preview clone.
- **P3** GCS app-storage API + SDK.
- External-DB path: keep/extend the bolt connector integration in the panel.
