# READY ↔ ReleaseManifest atomicity — fix-forward for the expert refusal (2nd round)

> ### Second expert, re-audit at `b0690bfe` — déjà couvert
>
> Un second expert a soulevé cette réserve à un SHA **antérieur** (`b0690bfe`). Elle est
> couverte par la tête actuelle. Vérification au code, pas sur parole :
>
> | Exigé | À la tête |
> |---|---|
> | `rollbackable:false`/`manifest_pending` dans CHAQUE mutation static ET server atteignant READY | **10 sites** passent par `sealPendingRollback` |
> | `true` seulement après manifeste durable | **2 seuls** écrivains du drapeau : le seal (`false`) et `reflectRollbackability` (après `writeReleaseManifest`). Aucun `rollbackable: true` écrit ailleurs |
> | le site nommé `reconcileDeploymentStatus` (server BUILDING→READY) | scellé dans la même écriture que le flip |
> | create-immédiat-READY | promote-to-production **et** rollback-to-deployment, tous deux scellés (ils héritaient `true` de la ligne source/cible — fail-open **sans crash**) |
> | rollbacks serveur | `rollback-to-previous` et rollback-par-digest scellés ; sur ce chemin le manifeste est même écrit **avant** READY |
> | crash sur transitions RÉELLES, pas une ligne fabriquée | `rollback-ready-transition-crash.spec.ts` pilote les vrais handlers ; `CrashAfterCommitStore` laisse l'écriture réelle **commiter** puis passe DEAD et lève |
>
> Rouge→vert rejoué contre la base **avant-lot** (`origin/main`) :
> **ROUGE 10/10 échouent**, **VERT 10/10 passent**. Les deux formes de fail-open
> apparaissent — 6× `got undefined` (drapeau ABSENT) et 4× `got true` (HÉRITÉ). Au site
> exact nommé, l'échec lit :
> `crashed server promotion: rollbackable must be false, got undefined` — soit la réserve
> mot pour mot.
>
> ⚠️ La réserve du second expert sur le test qui « fabrique une ligne déjà marquée » visait
> `rollback-crash-atomicity.spec.ts`, conservé du lot refusé. Elle était fondée : ce
> fichier assertait bien une fixture. Il est resté (il couvre l'idempotence du reconciler),
> mais ce n'est **plus** lui qui porte la preuve d'atomicité — c'est
> `rollback-ready-transition-crash.spec.ts`.

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

It runs the same spec twice against the same checkout: **RED** with the two fixed source
files checked out from the parent (refused) commit — the spec, which did not exist there,
stays in place — then **GREEN** at HEAD. A test green in both states proves nothing;
RED-then-GREEN is the point.

Verdict block from the run on the new SHA:

```
RED   :       Tests  6 failed | 4 passed (10)
GREEN :       Tests  10 passed (10)

Fail-open shapes observed in the RED run (both must appear):
   4 rollbackable must be false, got true
   4 rollbackable must be false, got undefined
```

### RED — spec vs. the refused code

```
   ✓ static publish BUILDING→READY (runDeploymentBuildFlow) > crash right after the READY commit leaves the row FAIL-CLOSED with no manifest
   ✓ static publish BUILDING→READY (runDeploymentBuildFlow) > reconciler repairs the crashed row DURABLY on the next read
   ✓ static publish BUILDING→READY (runDeploymentBuildFlow) > without a crash the flag is true ONLY alongside a durable manifest
   × server BUILDING→READY (reconcileDeploymentStatus, on read) > crash right after the promotion commit leaves the row FAIL-CLOSED
   ✓ server BUILDING→READY (reconcileDeploymentStatus, on read) > with no crash the promotion is completed by the reconciler (manifest, then true)
   × promote-to-production create-READY > crash right after the create commit leaves the production row FAIL-CLOSED
   × promote-to-production create-READY > without a crash the production row gets its OWN production manifest
   × server rollback-to-previous READY > crash right after the rollback READY commit leaves the row FAIL-CLOSED
   × server rollback-to-previous READY > without a crash the rollback records its manifest BEFORE claiming rollbackable
   × rollback-to-deployment never inherits the target rollbackable:true

 Test Files  1 failed (1)
      Tests  6 failed | 4 passed (10)
```

Assertion messages — the two fail-open shapes, on the real transitions:

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

### Full `services/api` suite — the six failures were contention, not logic

A full-suite run (`--pool=forks --poolOptions.forks.maxForks=3`) on a loaded machine
reported 6 failures across 4 files. Every one was `Test timed out in 120000ms` /
`180000ms` — **no assertion failed** — with per-file durations of 283s / 297s / 219s /
181s. The host was saturated at the time (`kern.num_files` 29912 of a 30720 maximum, with
a dozen other worktrees and dev servers running); an earlier parallel attempt had already
died on a vitest IPC error, and one of the four files (`vitest-config-discovery.spec.ts`)
has nothing to do with this change.

Replayed in isolation once the host was quiet (`kern.num_files` 11458):

```
$ npx vitest --run --config vitest.config.ts --pool=forks --poolOptions.forks.singleFork=true \
    src/tests/rollback-ready-transition-crash.spec.ts \
    src/tests/deployment-rollback-digest.spec.ts \
    src/tests/rollback-fault-injection.spec.ts \
    src/tests/vitest-config-discovery.spec.ts

 ✓ src/tests/rollback-ready-transition-crash.spec.ts (10 tests)   3136ms
 ✓ src/tests/deployment-rollback-digest.spec.ts      (6 tests)    1757ms
 ✓ src/tests/rollback-fault-injection.spec.ts        (7 tests)    2040ms
 ✓ src/tests/vitest-config-discovery.spec.ts         (1 test)    17195ms

 Test Files  4 passed (4)
      Tests  24 passed (24)
```

3.1s versus 283s for the same file is the contention signature. CI, which runs on a
dedicated runner, is the arbiter.

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
