# READY ↔ ReleaseManifest atomicity — fix-forward for the expert refusal (2nd round)

Lot Rollback / P0-V3-08. Refused SHA: `b0690bfe1a137912fa39cc1c21ba6c50740acdb3`
(branch `fix/deploy-rollback-integrity`, PR #94, CHANGES_REQUESTED).

## The reservation, restated

> `reconcileDeploymentStatus` persists READY **before** the manifest reconciler
> (`services/api/src/app.ts:3708`). A crash injected post-commit on the real server
> `BUILDING → READY` transition reproduces a persisted READY row with `rollbackable`
> absent, no `manifest_pending` reason and no manifest. The new atomicity test
> fabricates a row that is ALREADY marked, so it never traverses that transition.
> Other server paths bypass the marker too: create-immediately-READY, and server rollbacks.

The reservation was correct, and understated. The refused lot sealed exactly **one**
transition — the static/hook publish and the redeploy — and left **six** others able to
persist a READY static/server row with no durable manifest behind it.

## Inventory: every mutation that can persist READY

| # | Site (`services/api/src/app.ts`) | Path | Before | After |
|---|---|---|---|---|
| 1 | `reconcileDeploymentStatus` | async server `BUILDING→READY` on read | ❌ no marker, no manifest | sealed; read-path reconciler completes it |
| 2 | create → server branch | **primary server publish** | ❌ no marker **and no manifest write at all** | sealed + manifest + reflect |
| 3 | create → static/hook branch | static publish | ✅ already sealed | sealed via choke point |
| 4 | promote-to-production | **create-immediately-READY** | ❌ **inherited `rollbackable:true`** from source | sealed + production manifest + reflect |
| 5 | redeploy | rebuild | ✅ already sealed | sealed via choke point |
| 6 | rollback-to-previous, static | restore | ✅ manifest written before READY | sealed + reflect (uniform) |
| 7 | rollback-to-previous, server | re-deploy by digest | ❌ **READY, then manifest** | sealed + manifest + reflect |
| 8 | rollback-to-deployment, create | **create-immediately-READY** (static) | ❌ **inherited `rollbackable:true`** from target | sealed |
| 9 | rollback-to-deployment, provider | external rollback | ❌ inherited | sealed |
| 10 | rollback-to-deployment, server digest | re-deploy by digest | ❌ READY, **no manifest at all** | sealed + manifest + reflect |

Two distinct fail-OPEN shapes were live in production code:

* **`rollbackable` ABSENT** (#1, #2, #7, #10) — not `false`. Any reader testing
  `!== false` treats an unmarked row as rollbackable.
* **`rollbackable` INHERITED `true`** (#4, #8, #9) — copied wholesale from the source or
  target row's metadata. This one needs **no crash at all**: the promoted production row
  advertised itself as rollbackable while owning no manifest in the production stream.

## The fix

Requirements 1 and 2 are enforced **structurally**, at a single choke point, rather than
by remembering to spread a helper at each call site — that is what let six sites drift.

`sealPendingRollback(row, patch)` (`services/api/src/app.ts`) is applied to every
deployment create/update that can carry `status: 'READY'`. When the row is static/server
and the patch persists READY, it **forces** `rollbackable:false` +
`rollbackUnavailableReason:'manifest_pending'` into that same write, overwriting any
inherited flag. `reflectRollbackability` is the only writer that may set
`rollbackable:true`, and it runs strictly after `writeReleaseManifest` reports the
manifest durable. `reconcileRollbackManifest` repairs a row left pending by a crash, on
the deployment read path.

Invariant: **a static/server deployment row is never persisted at READY with
`rollbackable !== false` unless its manifest is already durable.**

## Requirement 3 — crash injected on the REAL transitions

`services/api/src/tests/rollback-ready-transition-crash.spec.ts` (10 tests).

Nothing is fabricated. Each test drives the real handler and kills the process at the
post-commit instant via `CrashAfterCommitStore`: the genuine write commits, then the
store flips **dead** — every later deployment/manifest mutation is dropped, exactly as
writes from a killed process never reach the database — and throws. The dead-store part
matters: merely throwing would be caught by the handlers' own `try/catch`, which would
then run compensation writes (the rollback handler marking the row FAILED) that a
`kill -9` never performs.

Transitions covered, each with a crash case and a no-crash case:

1. static publish `BUILDING→READY` inside `runDeploymentBuildFlow` — the shared build
   drive used by both the synchronous deploy POST and the production worker path
   (`POST /internal/deployments/build`);
2. server `BUILDING→READY` inside `reconcileDeploymentStatus` — the exact site named;
3. promote-to-production create-READY;
4. server `rollback-to-previous` READY;
5. rollback-to-deployment create-READY inheritance (no crash needed).

## Replayable proof

```
bash scripts/prove-rollback-ready-atomicity.sh
```

It runs the same spec twice against the same tree: **RED** with the two fixed source
files stashed (spec unchanged), then **GREEN** with the fix applied. A test green in
both states proves nothing; RED-then-GREEN is the point.

### RED — spec vs. the refused code

```
 Test Files  1 failed (1)
      Tests  6 failed | 4 passed (10)
```

The six failures are the two fail-open shapes, on the real transitions:

```
crashed server promotion:      rollbackable must be false, got undefined
crashed server rollback:       rollbackable must be false, got undefined
promoted production row:       rollbackable must be false, got true
rollback-to-deployment copy:   rollbackable must be false, got true
```

The four that pass in RED are the static-publish trio and the server no-crash case —
i.e. precisely the path the refused lot did seal. The suite demarcates what was already
fixed from what was missed.

### GREEN — spec vs. the fix

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Rollback suite

```
$ npx vitest --run --config vitest.config.ts --pool=forks --poolOptions.forks.singleFork=true \
    src/tests/rollback-ready-transition-crash.spec.ts \
    src/tests/rollback-crash-atomicity.spec.ts \
    src/tests/rollback-linearization-concurrency.spec.ts \
    src/tests/rollback-to-previous.spec.ts \
    src/tests/rollback-fault-injection.spec.ts \
    src/tests/deployment-rollback-digest.spec.ts

 Test Files  6 passed (6)
      Tests  37 passed (37)
```

## Local environment caveats (not shipped, not masking anything)

Two artifacts of this worktree, recorded so the counter-audit is not surprised by them:

* `services/api` strict `tsc` reports **27 errors before and after** this change — stale
  generated Prisma client and `@vibecore/*` resolving into a sibling worktree via the
  shared `node_modules` symlink. Normalising `line:col`, the before/after error sets are
  byte-identical: the change introduces **zero** new type errors.
* `services/api/src/node_modules/@vibecore/*` is a local, git-ignored shadow pointing at
  this worktree's own `packages/*`, so the tests resolve the branch's billing package
  instead of the main checkout's. Without it the publish route 500s on an unresolvable
  `EntitlementError` — which is also why the refused lot's suite never exercised publish.
