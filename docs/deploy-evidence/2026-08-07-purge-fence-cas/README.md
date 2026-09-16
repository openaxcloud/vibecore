# R-P3-06 / R-P3-07 — purge barrier: atomic CAS, then a fail-closed door in front of it

Answers two successive BLOCKING reserves on PR #52.

| Reserve | Audited SHA | Subject |
|---|---|---|
| R-P3-06 | `3bd148b47d8a59fc224c854e50321304459ccce8` | ABA on the fence release (read-then-write) |
| R-P3-07 | `b8c620c0b35a218672e83e5012bb8713a071e586` | the reconcile route had **no authentication at all** |

R-P3-06 made the release correct under concurrency. R-P3-07 is the reserve that
followed: a correct CAS is worth nothing if anyone on the network can call the route
that performs it. Both sections below stand on their own.

---

# R-P3-07 — the reconcile route was unauthenticated (reserve #2)

## The defect

The manager's global `onRequest` hook exempted the **entire** `/internal/` namespace,
on the assumption that every route under it enforces its own auth. One did
(`/internal/workspaces/:id/agent` → preview-proxy secret).
`/internal/reconcile-workspace-freezes` did not — and `graceMs` was read raw off the
request body. So:

```
POST /internal/reconcile-workspace-freezes   (no Authorization header)
{"graceMs": 0}
```

`graceMs: 0` puts the staleness cutoff at *now*, making **every** barrier stale, and
nothing asked who was calling. One unauthenticated request disarmed every active purge
fence in the fleet — the exact barrier that stops a runtime being reprovisioned in the
middle of an erasure.

The endpoint also had **no caller anywhere in the repo**, which is why the missing auth
went unnoticed: barriers were only ever reconciled by a hand-rolled curl.

## Red/green proof

[`r-p3-07-auth-red-green.txt`](./r-p3-07-auth-red-green.txt) — the same exploit against
a barrier frozen **one second earlier** whose owning purge is **alive**:

```
--- before the fix ---
[redproof] status=200 body={"scanned":1,"reconciled":1,"skippedLiveOwner":0,"failed":0}
[redproof] purgeFrozen AFTER unauthenticated call = false     ← barrier DOWN

--- after the fix ---
[redproof] status=401 body={"error":"Unauthorized workspace manager request",
                            "code":"WORKSPACE_MANAGER_UNAUTHORIZED"}
[redproof] purgeFrozen AFTER unauthenticated call = true      ← barrier HELD
```

The 9 new route tests were re-run against the pre-fix code: **8 fail** (`expected 200 to
be 401`, `expected 200 to be 400`, `expected 404 to be 503`, …). The 9th is the positive
case — an authenticated call with a sane window still works — and passes on both, as it
must.

## The fix

| # | Reserve | Change |
|---|---------|--------|
| 1 | Dedicated fail-closed auth | The blanket exemption is replaced by an explicit `INTERNAL_ROUTE_AUTH` registry. Each internal route declares its scheme; a route with **no** declaration is refused `503`. Forgetting to wire auth now fails closed instead of publishing an open control-plane endpoint. Matching is exact-path or `prefix + '/'`, so `/internal/…-EVIL` inherits nothing. `requireControlPlaneAuth` has **no dev exemption** — unlike the global hook, an unset secret is refused everywhere. |
| 2 | `graceMs` floor | zod `min(MIN_RECONCILE_GRACE_MS)` = 1h at the route **and** re-checked in the manager, so the floor holds for every caller, not just this route. `0` / negative / NaN / below-floor → `400`. Default unchanged (24h). |
| 3 | Live plan/fence binding | `isPurgeFenceOwnerLive(fenceToken)`: a barrier whose token still belongs to a `PurgePlan` with an unexpired lease is **never** lifted, whatever its age. A running purge heartbeats its lease, so a legitimately long purge is skipped rather than raced. Fail-closed: if liveness can't be determined the barrier stays up (counted in `failed`). Not filtered on `status` — a `RECLAIMING` plan with a live lease is still being acted on. |
| 4 | Errors propagated | The scan no longer does `.catch(() => [])` — a permanently broken reconciler used to return `{reconciled: 0}`, indistinguishable from a clean sweep. The job throws on a network error and on any non-2xx. |
| 5 | Authenticated, observable job | New BullMQ job `workspace.freezeReconcile` + hourly Helm CronJob, carrying the dedicated secret, timeout-bounded, returning `{scanned, reconciled, skippedLiveOwner, failed}` so a sweep that skipped live owners or hit failures is not "success". |

## Tests

Required by the reserve, all present:

| Case | Expected | Where |
|---|---|---|
| no token | `401` + barrier held | `app.spec.ts` |
| wrong token | `401` + barrier held | `app.spec.ts` |
| no secret configured (non-prod) | `503` + barrier held | `app.spec.ts` |
| `graceMs: 0` with a **valid** token | `400` + barrier held | `app.spec.ts` |
| negative / below-floor `graceMs` | `400` | `app.spec.ts` + `manager.spec.ts` |
| undeclared internal route | `503`, not exempted | `app.spec.ts` |
| **long purge** (alive past the window) | barrier held, then reclaimed once the lease lapses | `manager.spec.ts` + real PG |
| liveness lookup fails | barrier held, `failed: 1` | `app.spec.ts` |
| job: missing URL / missing secret / 400,401,403,500,503 / network error | throws | `workspace-freeze-reconcile.spec.ts` |

Liveness is additionally proven against **real `PurgePlan` rows** on PostgreSQL 16
(unexpired lease → live; expired → reclaimable; `RECLAIMING` + live lease → live), and
end-to-end through the manager:

```
[proof] longpurge alive → skippedLiveOwner=1 purgeFrozen=true
[proof] longpurge dead  → purgeFrozen=false
```

## Honest limits (R-P3-07)

- The auth is a **shared bearer secret**, matching the rest of this control plane — not
  mTLS or per-caller identity. It closes the reserve as filed; it does not make the
  internal namespace individually attributable.
- `JsonWorkspaceStore` (single-file dev store) reports "no live owner": it has no
  `PurgePlan` table, because purge leases only exist in the Postgres deployment.
  Production runs `PrismaWorkspaceStore`, which does the real lease lookup.
- The hourly CronJob is **rendered and unit-tested, not observed running in-cluster** —
  nothing here was deployed.

---

# R-P3-06 — purge barrier release is an atomic CAS (reserve #1)

Answers the BLOCKING reserve raised against PR #52 @ audited SHA
`3bd148b47d8a59fc224c854e50321304459ccce8`.

## The defect

`WorkspaceManager.unfreezeWorkspace` READ the fence token, validated it in application
code, then issued an **unconditional** `UPDATE … WHERE id = ?`. A purge attempt N0 that
was delayed *between those two statements* wiped a barrier that attempt N1 had installed
in the meantime — expected `purgeFrozen=true / purgeFenceToken=owner-N1`, observed
`purgeFrozen=false`. A textbook ABA: the value the reader validated was replaced, and the
writer never re-checked. `reconcileStaleWorkspaceFreezes` carried the same TOCTOU against
the snapshot it scanned, and several barrier reads did `.catch(() => undefined)`, making a
DB error indistinguishable from "no barrier" — they failed **open**.

Why the existing R-P3-05 test missed it: it ran the delayed unfreeze *sequentially*, so by
the time it read, the newer token was already committed and the application-side check
bailed. The bug only appears when the competing freeze lands **inside** the read→write
window.

## The fix

| # | Reserve | Change |
|---|---------|--------|
| 1 | CAS on release | `WorkspaceStore.releasePurgeFence(id, token)` — one conditional `UPDATE … WHERE id AND purgeFrozen AND purgeFenceToken`; 0 rows ⇒ do **not** unfreeze |
| 2 | CAS for the reconciler | `releaseStalePurgeFence(id, {fenceToken, frozenAt})` — CAS on the exact snapshot version the staleness verdict came from |
| 3 | Fail-**closed** reads | `assertNotPurgeFrozen` throws `WORKSPACE_PURGE_BARRIER_UNVERIFIABLE`, `isPurgeFrozen` returns `true`, and `freezeWorkspace`'s row read refuses — none of them swallow DB errors |
| 4 | Interleaving tests on real PG | `purge-fence-cas.integration.spec.ts` (14 tests) + 4 CI-runnable unit tests |

Files: `services/workspace-manager/src/{manager,prisma-store}.ts`.
The `updateMany`-based CAS follows the `claimMeterWindow` precedent already in this store.

## Replay

```bash
# 1. a real PostgreSQL 16 (throwaway; pgvector image because the schema needs `vector`)
docker run -d --name purge52-pg16 \
  -e POSTGRES_USER=vibecore -e POSTGRES_PASSWORD=purge52_local -e POSTGRES_DB=purge52_cas \
  -p 55433:5432 pgvector/pgvector:pg16
until docker exec purge52-pg16 pg_isready -U vibecore -d purge52_cas; do sleep 2; done
docker exec purge52-pg16 psql -U vibecore -d purge52_cas -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 2. schema
cd packages/database && ../../node_modules/.bin/prisma db push \
  --url "postgresql://vibecore:purge52_local@127.0.0.1:55433/purge52_cas" --accept-data-loss

# 3. the interleaving proof (14 tests)
cd ../../services/workspace-manager
DATABASE_URL="postgresql://vibecore:purge52_local@127.0.0.1:55433/purge52_cas" \
  ../../node_modules/.bin/vitest --run --config vitest.config.ts \
  src/purge-fence-cas.integration.spec.ts

# 4. whole service, real DB attached
DATABASE_URL="postgresql://vibecore:purge52_local@127.0.0.1:55433/purge52_cas" \
  ../../node_modules/.bin/vitest --run --config vitest.config.ts
```

Raw output: [`pg16-interleaving-run.txt`](./pg16-interleaving-run.txt) — **14/14, exit 0**,
on `PostgreSQL 16.13 (Debian 16.13-1.pgdg12+1)`. Full service suite with the DB attached:
**110/110, exit 0**. Typecheck (`manager.ts`, `app.ts`, `server.ts`, `prisma-store.ts`,
`--strict`): exit 0.

`TRUNCATE "WorkspaceRuntime"` before step 3 if you want the `reconciled=` counter to read
0 — the sweep is table-wide, so rows left by earlier runs are legitimately reconciled too.
The assertions target the specific row, not the count.

Two physically distinct `createDatabaseClient()` instances are used, so attempt N0 and
attempt N1 never share a connection — the race is a genuine cross-backend interleaving.

## What the run prints

```
[proof] server: PostgreSQL 16.13 (Debian 16.13-1.pgdg12+1) …
[proof] legacy          → purgeFrozen=false token=null          ← defect reproduced
[proof] cas             → released=false purgeFrozen=true token=owner-N1   ← fixed
[proof] legacy reconciler → purgeFrozen=false                   ← defect reproduced
[proof] cas reconciler  → reconciled=0 purgeFrozen=true token=owner-N1     ← fixed
[proof] fail-closed     → WORKSPACE_PURGE_BARRIER_UNVERIFIABLE: …
```

Every test pairs the **legacy** read-then-write and the **fixed** CAS under the *same*
interleaving, injected at the *same* point (`legacyUnfreeze`'s explicit TOCTOU window vs.
`DelayedReleaseStore`, which fires the competing freeze immediately before the CAS write).
The legacy assertions are what make the suite non-vacuous: they prove the harness really
drives the race instead of asserting a no-op.

## The tests are discriminating (verified, not asserted)

Both new suites were re-run with the pre-fix bodies restored:

| Test | vs. pre-fix code |
|------|------------------|
| `FIXED CAS survives the identical interleaving` | FAIL — `released=true`, barrier wiped |
| `FIXED reconciler leaves a barrier re-frozen mid-sweep alone` | FAIL — `reconciled=1` |
| `R-P3-06, ABA` (unit) | FAIL — `expected {released: true} to equal {released: false}` |
| `R-P3-06 reconciler` (unit) | FAIL — `expected {reconciled: 1} to equal {reconciled: 0}` |
| `R-P3-06 barrier read that ERRORS` (unit) | FAIL — no `WORKSPACE_PURGE_BARRIER_UNVERIFIABLE` |
| `R-P3-06 FINAL post-create check fails CLOSED` (unit) | FAIL — **start resolved successfully**, live Pod left on a runtime whose barrier could not be read |
| `LEGACY …` (both suites) | PASS — i.e. the defect reproduces on demand |

The last row is the cleanest fail-open demonstration: pre-fix, an unreadable barrier let
`startWorkspace` complete.

## Literal SQL

[`pg16-statement-log.txt`](./pg16-statement-log.txt), captured with `log_statement=all`:

```sql
-- fixed: release, fenced
… WHERE ("id" = $5 AND "purgeFrozen" = $6 AND "purgeFenceToken" = $7)
-- fixed: reconciler, version-checked
… WHERE ("id" = $5 AND "purgeFrozen" = $6 AND "purgeFenceToken" = $7 AND "purgeFrozenAt" = $8)
-- fixed: token-less barrier — Prisma emits IS NULL, not `= NULL`
… WHERE ("id" = $5 AND "purgeFrozen" = $6 AND "purgeFenceToken" IS NULL)
-- LEGACY, for contrast: unconditional, id only
… WHERE ("id" = $5 AND 1=1) RETURNING …
```

The `IS NULL` form is load-bearing and has its own regression test: SQL `= NULL` is never
true, so comparing a null token with `=` would leave a token-less barrier **unreleasable**
and wedge the runtime until the 24h reconciler.

## Edge bug caught in this fix itself

Moving the ownership test from application code into the WHERE clause changed what the
token value *means*: it stopped being something a JS truthiness check reads and became a
literal SQL operand. Two pre-existing truthiness tests silently broke under that change —
both folding an **empty-string** token into "no token":

- `rowToRecord`: `row.purgeFenceToken ? {…} : {}` → a `''`-fenced row read back as
  token-less;
- the reconciler: `row.purgeFenceToken ? { fenceToken: … } : {}` → fed `null` into the CAS.

Combined, a barrier fenced with `''` would CAS against `NULL`, match 0 rows, and become
**permanently unreclaimable** — strictly worse than the pre-fix behaviour, where the
unconditional update always reclaimed it. It is reachable in principle: `app.ts` freezes
with `fenceToken ?? ''`.

Both are now `!== null` / `!== undefined`, and
`an empty-string fence token round-trips and stays reclaimable` locks it in. The test was
written first and **did fail** against the intermediate version of this fix — that is how
the bug was found, not by inspection.

## Preserved behaviour

`R-P3-03` (a token-less caller can never lift a fenced barrier) and `R-P3-04` (a genuinely
orphaned barrier is still reclaimed) each keep a dedicated test. The parts of PR #52 the
expert passed — T11/T15-24, T27/T27b, PurgeReceipt/tombstone/conditional dequeue — are
untouched.

## Notes / limits

- `vitest.config.ts` now sets `fileParallelism: false` for this service. Two suites hit the
  same real `WorkspaceRuntime` table, and `prisma-store.spec.ts`'s list test derives "rows
  I inserted" by diffing the whole table around its own inserts. Serialising the files was
  preferred over loosening that assertion; the suite runs in well under a second.
- `unfreezeWorkspace` now returns `{ released: boolean }` (was `void`) so callers and tests
  can distinguish "I lifted it" from "not mine". The HTTP route still replies `204` — an
  idempotent no-op is not an error.
- `JsonWorkspaceStore` (single-file dev store) implements the same conditional semantics.
  It cannot offer row-level atomicity, but it is documented single-replica; production runs
  `PrismaWorkspaceStore`.
- The two fail-closed assertions on `freezeWorkspace` pass against the pre-fix code too
  (it already reached `WORKSPACE_FREEZE_PERSIST_FAILED` by another route). They are contract
  tests, not regression proofs — the discriminating fail-open evidence is the table above.
