# R-P3-06 — purge barrier release is an atomic CAS (expert reserve on PR #52)

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
