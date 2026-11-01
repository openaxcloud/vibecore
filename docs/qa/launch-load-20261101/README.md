# Sustained isolated API exercise — 1 November 2026

This is a separate branch based on #869, not a change to that validated PR.
No production host, paid provider, cloud resource or access change is involved.
The previously denied GitHub artifact archive is not retrieved or retried.

## Proposed objectives, recorded before the run

These are evaluation targets for this small isolated fixture, **not production
capacity, an SLA, or a promise about thousands of users**:

- Zero unexpected HTTP errors, timeouts, cross-organization disclosure or lost
  acknowledged writes in every phase, including pressure and recovery.
- Exactly one admission and 39 `QUOTA_EXCEEDED` refusals when forty concurrent
  project creations on two independent API processes compete for one slot.
- A shared Redis rate budget: exactly 2000 successes and 100 explicit 429s for
  2100 requests under one synthetic credential across both processes; successful
  request after expiry. Rate refusals must not be called project-quota refusals.
- Baseline (`steady`, eight users): p95 <500ms for normal reads/writes,
  p95 <1500ms for Git/export, event-loop p99 <100ms. Pressure results are reported
  against the same targets, but an exceeded latency target is an observation
  about this fixture, not automatically an application correctness defect.
- Twenty files per project and the final acknowledged file/state version for each
  project survive fresh API processes/connections; counters match all acknowledged
  edits. This does not establish historical version retention. Archive bytes match stored objects. Archiving a quota
  project frees exactly one slot; admission then succeeds again.

## Fixed workload

Two **separate Node processes**, each real Fastify + Prisma, share one disposable
PostgreSQL and one disposable Redis. Main DB pools: ten connections per API;
advisory-lock pools: five per API. PostgreSQL is limited to one CPU/512MiB;
Redis to half a CPU/128MiB. API processes inherit the executor's resources and
are measured individually; they are not production pods. The measured executor
cgroup had a four-CPU quota and 16 GiB memory limit, shared with the load client
and Git subprocesses. Host logical CPU count in receipts is not that quota.

After quota/rate bursts: warmup 4 users/15s; steady 8 users/60s; pressure
24 users/90s; recovery 8 users/30s. Clients are closed-loop, at most one in-flight request per
active user with 100ms think time after each operation. The edit operation has
two sequential HTTP requests (file import, then IDE state save). This is completed throughput, not an open-loop
arrival-rate experiment. Each user has a distinct organization/project.

The rotating workload reads project/state/usage, writes file content through the real ZIP import route and saves IDE state, checks Git
status, validates every ZIP's twenty files, exercises a full project's quota,
and attempts a foreign organization's state. No preview/runtime, browser, AI,
checkout, remote Git or deployment is simulated as successful.

Metrics: per-route/per-phase p50/p95/p99/max and exact status counts; acknowledged
writes; per-API RSS/CPU/event-loop utilization and lag; PostgreSQL connections,
lock waiters, transaction/deadlock/temp-file/cache counters; Redis memory, clients,
blocked clients, evictions, rejected connections; local Docker CPU/memory stats.
Expected 404/429 outcomes are kept separate from successful business requests.

## Procedures requiring existing authorized integrations

[Stripe sandbox and CNPG/GCS post-deployment recipes](post-deploy-recipes.md)
provide finite acceptance criteria, prerequisites, failure handling and cleanup.
Neither recipe was run here. No secret values or new access are requested.

The final receipt separates `correctnessPassed` from `allProposedObjectivesMet`;
missing observations, cleanup failures and source changes invalidate correctness.
CPU samples exclude Git child processes; sampled lock statistics may miss brief
waits. Restart checks exercise fresh API processes and DB connections, not a
PostgreSQL crash/restart. Retained archive objects are reread through a fresh DB
connection after API restart.


## Reproduce on a disposable local executor

Use repository-installed dependencies and already cached images; no provider
credentials are needed. The password below is a public synthetic fixture value.
The harness refuses other database/Redis addresses and a database containing
organizations. These fixed ports/names must be unused before beginning.

```sh
docker --host=unix:///var/run/docker.sock run -d --rm --name launch-load-postgres --label vibecore.qa=sustained-load-20261101 --cpus=1 --memory=512m -p 127.0.0.1:55436:5432 -e POSTGRES_USER=load_proof -e POSTGRES_PASSWORD=local_fixture -e POSTGRES_DB=sustained_load_proof pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b
docker --host=unix:///var/run/docker.sock run -d --rm --name launch-load-redis --label vibecore.qa=sustained-load-20261101 --cpus=0.5 --memory=128m -p 127.0.0.1:56376:6379 redis@sha256:8da19c7399dca900c6822a1cf30f9d2285585e2c4b457ff4095b0f4500054d3f redis-server --save '' --appendonly no
docker --host=unix:///var/run/docker.sock exec launch-load-postgres pg_isready -U load_proof -d sustained_load_proof
(cd packages/database && DATABASE_URL=postgresql://load_proof:local_fixture@127.0.0.1:55436/sustained_load_proof ../../node_modules/.bin/prisma migrate deploy)
LOCAL_LOAD_PROOF=1 NODE_ENV=test DATABASE_URL=postgresql://load_proof:local_fixture@127.0.0.1:55436/sustained_load_proof REDIS_URL=redis://127.0.0.1:56376/0 node --import tsx services/api/src/sustained-local-load-proof.mts /tmp/sustained-load.json
(cd services/api && ../../node_modules/.bin/vitest run --config vitest.config.ts src/sustained-load-evidence.spec.ts)
```

Wait until `pg_isready` succeeds before migrating. Do not run builds or other
heavy jobs during the measurement. Inspect both `correctnessPassed` and
`allProposedObjectivesMet`; exit success only establishes functional checks.
Each receipt records start/end source hashes, the base commit and dirty state
(the new harness was uncommitted while recording evidence). Compare those hashes
to the submitted files before reusing results.

After recording results, inspect that both containers have the above ownership
label, then stop only these disposable containers:

```sh
docker --host=unix:///var/run/docker.sock inspect --format '{{.Name}} {{index .Config.Labels "vibecore.qa"}}' launch-load-postgres launch-load-redis
docker --host=unix:///var/run/docker.sock stop launch-load-postgres launch-load-redis
```

Both use `--rm`; this removes only their synthetic databases. The harness also
removes its own organization/user rows, Redis prefix and temporary file tree.
On an interrupted run, preserve its receipt/log and reconcile those exact owned
resources before rerunning. Never repoint these commands at a shared database.


## What remains outside this proof

| Criterion | This isolated exercise | Remaining launch evidence |
|---|---|---|
| Concurrent project quota | Two API processes, forty contenders, one available slot; readback and slot reuse | Same deployed configuration and shared admission store |
| HTTP rate limiting | Shared Redis budget, explicit refusals and later recovery | Deployed Redis availability/topology and operational policy |
| Tenant separation | Positive owner reads and negative foreign reads throughout pressure | Broader route coverage in #869; deployment configuration review |
| Data retention under load | Acknowledged final file/state versions and archive objects after API restart | Cloud storage durability and recovery, not established by API restart |
| Latency and saturation | Fixed synthetic workload, CPU/memory/lag/DB/Redis observations | Representative deployed workload, longer soak, independent generator; explicit authorization before external load |
| Real payment/recovery providers | Reproducible bounded acceptance recipes only | Existing Stripe sandbox integration; CNPG/GCS adapter, fencing and authorized test resources |

The initial quota-only attempt correctly returned one admission and 39 refusals,
but the harness expected an extra `quotaKey` field absent from the generic HTTP
error contract. That assertion was corrected to the actual `QUOTA_EXCEEDED`
contract; it was a harness error, not a demonstrated product defect. Early
state-only exploration was superseded by actual file import/export measurements.
No product performance change or capacity guarantee follows from this exercise.
