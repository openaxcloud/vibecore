# Database dev/prod model — Replit parity (guarantee)

Every project has **two** databases — a `development` DB (co-located with the
workspace, what the IDE edits) and a separate `production` DB (provisioned on
publish). This mirrors Replit: a dev database alongside the Repl, and a distinct
production database for the deployed app. The isolation axis is the org **plan**.

## The matrix

| plan | tier | `development` DB | `production` DB | isolation |
|---|---|---|---|---|
| free | `shared` | logical DB `proj_<id>` on the **shared** HA cluster `shared-pg-0`, owner role `t_<id>`, `REVOKE CONNECT … FROM PUBLIC` | logical DB `proj_<id>_prod` on `shared-pg-0`, owner role `t_<id>_prod`, `REVOKE CONNECT …` | shared cluster, **isolated database + owner role per (project, env)** — a tenant can only connect to its own DB |
| team / enterprise | `isolated` | **dedicated** CNPG cluster `db-<id>` (its own pods + PVC) | **dedicated** CNPG cluster `db-<id>-prod` (its own pods + PVC) | full physical isolation — a separate Postgres per (project, env), never a shared logical DB |

`resolveDatabaseTier(plan)` (`services/api/src/database-provisioner.ts`): `free`/
unknown → `shared`; `team`/`enterprise` → `isolated`. **A paying customer is never
on the shared cluster — not even in development** (Replit isolates Helium dev too).

## Guarantees (enforced in code + tested)

1. **Per-project isolation for paid.** `isolated` provisioning applies a dedicated
   `Cluster` (and `ScheduledBackup`) per `(projectId, environment)` —
   `db-<id>` for dev, `db-<id>-prod` for prod — and **never** a shared `Database`
   CRD or `Pooler`. *(tests: "dedicated per-project dev + prod clusters".)*
2. **Isolated DB + REVOKE for free.** `shared` provisioning creates a distinct
   logical database + owner role per `(projectId, environment)` and runs
   `REVOKE CONNECT ON DATABASE … FROM PUBLIC` + `GRANT CONNECT … TO <owner>`. A
   tenant role cannot connect to any other tenant's DB (proven live against real
   Postgres: cross-tenant + cross-env `CONNECT` is rejected with
   `permission denied for database`).
3. **Dev and prod never collide.** Names are suffixed only for production
   (`-prod` / `_prod`); development keeps the original un-suffixed names, so the
   split is fully backward compatible and dev↔prod data never mixes (proven live:
   `proj_<id>` holds only DEV data, `proj_<id>_prod` only PROD data).
4. **Distinct credentials per env.** The shared-tenant password is
   `HMAC(DB_SHARED_TENANT_SECRET, projectId[:production])` — dev and prod get
   different passwords; isolated clusters get independent CNPG-generated secrets
   (`db-<id>-app` vs `db-<id>-prod-app`).
5. **Wiring.** `GET/POST /projects/:id/database?environment=development|production`
   provisions/reads per environment; the dev URL lands in the `DATABASE_URL`
   project secret, the prod URL in `PROD_DATABASE_URL`, so both connections
   coexist in the IDE. Publishing a deployment provisions the production DB.

All of the above is **gated behind `DB_ROLLBACK_ENABLED`**; the production path is
additionally dormant until a deployment is published, so nothing changes for
existing projects until the feature is switched on.
