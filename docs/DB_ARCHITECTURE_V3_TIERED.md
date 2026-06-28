# Database & App-Storage architecture v3 — TIERED isolation by plan

> Supersedes `DB_ARCHITECTURE_V2_SHARED.md` (shared-only) and the per-project model in
> `DB_PITR_ARCHITECTURE.md`. Reason for the v2→v3 correction (validated with Avi after
> reading the 6 Replit docs): **Replit does NOT run a shared multi-tenant DB.** They
> sunset shared DBs (2026-06-08) and isolate every project. Their real model is two
> tiers, by lifecycle:
> - **Dev DB = Helium** — managed Postgres 16, co-located with the workspace, isolated per project.
> - **Prod DB = Neon** — serverless scale-to-zero, isolated per project (separate compute, shared-but-invisible storage).
>
> A shared CNPG cluster + logical DB (our v2) is a good **cost** play but **weaker
> isolation** than Replit (noisy-neighbour, cluster blast-radius, PITR is cluster-wide
> not per-project). So v2 is fine for **free/dev only**, not for paid/prod.

## Decision: tier selected by org PLAN (not by environment)

The axis is the **org plan**, NOT dev-vs-prod. A paying customer is isolated per
project **from dev onward** (matching Replit: Helium dev is already isolated, not
just Neon prod) — they are **never** on the shared cluster, even while developing.
Both the project's dev and prod databases use the same tier as the org plan.

| Tier | Plans (dev AND prod) | Backend | Isolation | Cost |
|---|---|---|---|---|
| **shared** | `free` | shared CNPG cluster pool + per-project **`Database` CRD** + owner role + `REVOKE CONNECT FROM PUBLIC` + PgBouncer Pooler + hibernation | logical (DB-level) | ~$1–2/mo/project |
| **isolated** | `team`, `enterprise` | **dedicated per-project CNPG `Cluster`** with declarative **hibernation/scale-to-zero** (pod+PVC down when idle, wake on first request) — or a serverless connector (Neon) | full (own cluster + own per-project PITR) | **~$2–3/mo hibernated** (vs ~$10–11 always-on, GKE Autopilot) |

Routing: `resolveDatabaseTier(planKey)` → `free → shared`, `team|enterprise → isolated`.
The Replit-parity dev/prod SPLIT (agent writes dev; publish creates prod; deploy-preview
clones prod) layers **inside the org's tier** — a paid project gets two isolated DBs
(dev + prod), a free project gets two shared logical DBs. Hibernation/scale-to-zero
applies to **both** tiers for cost.

Both tiers validated live on prod (2026-06-28, then cleaned up):
- shared: 1 cluster + 2 `Database` CRs, tenant connects to own DB, cross-tenant =
  `FATAL: permission denied` after `REVOKE CONNECT … FROM PUBLIC`.
- isolated: dedicated `Cluster` → healthy Postgres 18.3, `-app` secret, psql connect + DDL/DML.

## Components

- **Shared tier**: a placement picks the least-loaded shared cluster (cap ~few-hundred
  DBs/cluster, shard out as needed). Per project: `Database` CRD (db `proj_<id>`,
  owner role `t_<id>` via CNPG `managed.roles`) + isolation SQL + a Pooler entry.
  `DATABASE_URL` → **Pooler** host, db `proj_<id>`, user `t_<id>`.
- **Isolated tier**: dedicated `Cluster` per project (1–N instances by plan) with WI
  `serviceAccountTemplate` (Barman→GCS, per-project PITR), declarative hibernation
  annotation (`cnpg.io/hibernation`) driven by an inactivity reconciler; wake on first
  workspace start / query. `DATABASE_URL` → the cluster's own `-rw` (or dedicated Pooler).
- **Backups/PITR**: shared = cluster-scope (coarse); isolated = per-project (clean PITR,
  7d/28d by plan) — the parity-grade path for prod.
- **Dev vs Prod** (within the org's tier): agent only touches dev; publish applies the
  dev schema to a SEPARATE prod DB **of the same tier** (free → another shared logical
  DB; paid → another isolated cluster), optional copy-data; deployment-preview =
  throwaway clone of prod. Prod is not agent-writable.
- **`DATABASE_URL`**: app-scoped project secret, never public.
- **External DBs (keep bolt integrations)**: the panel offers Native (CNPG, tiered) AND
  Connect-external (Supabase/Neon/any Postgres via connection string).

## App / object storage (GCS, native like Replit)
Per project = dedicated prefix in a shared regional bucket; uniform bucket-level access;
lifecycle rules (temp auto-delete, nearline/coldline cold tier); signed URLs; WI already
configured. API + JS/Python SDK for generated apps (buckets, objects, folders, share).

## Phases (gated; operator + ns + WI + bucket from Phase 1 reused)
- **P2a** Provisioner: `resolveDatabaseTier(plan)` → **shared** branch (Database CRD +
  role + isolation + Pooler) and **isolated** branch (dedicated hibernation-capable
  Cluster); `DATABASE_URL` injection per tier. *(in progress)*
- **P2b** SQL/data API for the panel (tables/columns/rows, SQL runner, row CRUD, schema,
  usage) + NetworkPolicy api↔pooler/cluster.
- **P2c** Hibernation reconciler (both tiers) + backups/PITR.
- **P2d** Dev/prod split + publish + deployment-preview clone.
- **P3** GCS app-storage API + SDK.
