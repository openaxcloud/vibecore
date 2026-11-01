# Launch gates — 1 November 2026

Scope: web/mobile launch; no Railway, no server/Linux product expansion. Base
`a9f8b02b737e775b68a34d29e33124e5662ec63c` (#862), confirmed through GitHub on
1 November. This report replaces historical evidence as the **local** baseline;
it does not upgrade any production gate to passed. Other sessions own generation,
UI/Database usability and the #863–868 integration.

## Finite acceptance matrix

| Gate                                      | Fresh evidence                                                                                                                                                                                                                                                        | Configuration / production state                                                                                                                                                                        | Remaining acceptance action                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Correct charges and delivery           | Existing credit-pack webhook, quota and billing regressions rerun; see [billing report](billing.md). No provider call or payment.                                                                                                                                     | No Stripe binding or runtime variable is configured in this executor. Historical catalogue/expired-key reports are not current provider evidence.                                                       | With the existing authorized Stripe test integration: verify effective Plan DB catalogue vs provider amount/currency/interval; successful invoice, duplicate and concurrent delivery, failed payment, annual renewal, plan change and cancellation. Confirm each produces exactly one appropriate entitlement and no charge in live mode. |
| 2. Atomic credits and quota enforcement   | Real PostgreSQL fault/concurrency tests and Redis quota tests: see [billing report](billing.md).                                                                                                                                                                      | Local behavior only; no production balance inspection.                                                                                                                                                  | Merge/deploy validated patch through coordinator; verify deployed SHA and existing reconciliation/failed-webhook monitoring. No forced balance adjustment is authorized.                                                                                                                                                                  |
| 3. User/project confidentiality           | Corrected adversarial probes, real PostgreSQL connector tests and HTTP foreign-organization denials in [isolation report](../isolation-load-20261101/README.md).                                                                                                      | No new application isolation defect demonstrated. Kubernetes/network policy and production SQL roles were not inspected.                                                                                | Coordinator must record tenant A/B denial/readback checks on the delivered release with synthetic users, plus effective runtime/network isolation evidence. Passing route tests alone does not prove container isolation.                                                                                                                 |
| 4. Recoverable backup bytes               | `restore-physical.json`: PostgreSQL 16 backup verified, tamper rejected, WAL target honored, post-target write excluded, restart persistence. Fresh disposable clusters, no network listeners.                                                                        | Production scheduled backup age, offsite archive inventory and alerts unverified.                                                                                                                       | Read existing backup status/retention and failed-backup alerts; verify archive bytes/WAL continuity on a dedicated authorized CNPG/GCS test source, never production data.                                                                                                                                                                |
| 5. Safe application restore               | `restore-application-local.json`: real HTTP 202/409 admission, physical recovery, blocked probe during cutover, old pool closed, new pool readback, SQL API readback, restart persistence and cleanup. 113 distinct restore tests pass (74 synthetic +39 PostgreSQL). | `server.ts` still injects no restore coordinator. Production restore endpoints intentionally refuse with `RESTORE_APPLICATION_CUTOVER_UNAVAILABLE`; PRs #793/#794 remain draft/open at inspected heads. | Complete archive/target attestation, exhaustive SQL consumer registry and distributed fencing/drain including old attempts; wire API/workspace-manager only after isolated failure/recovery drill. Do not remove the 503 gate based on this cooperative local probe.                                                                      |
| 6. Defined capacity and overload behavior | [Local HTTP sample](../isolation-load-20261101/git-status-load.json): real PostgreSQL/files/Git/export, 30 measured requests, at most three concurrent; foreign tenant denied.                                                                                        | No production load performed; no claim about thousands of users. Existing generic k6 baseline probes only health/readiness/metrics.                                                                     | State intended launch concurrency and workload/SLO; run an isolated representative sustained test including login/project reads/writes/preview/export and controlled overload, record CPU/RAM/DB saturation, latency and errors. Provider generation requires separate approved test capacity.                                            |
| 7. Release checks                         | Targeted tests and draft PR checks are separate from production evidence. Parent coordinates merge/deploy.                                                                                                                                                            | This branch is not deployed.                                                                                                                                                                            | All required checks for exact PR head, review, integration checks, rollout SHA/image verification and post-deploy smoke.                                                                                                                                                                                                                  |

A failed or unproven gate stays open. A constrained early launch is a product
scope decision, not evidence that the restore or capacity gate passed. No RPO,
RTO or maximum-user promise is established by these local timings.

## Defects addressed in this branch

Credit reservation insertion and wallet hold were separate commits; release and
settlement likewise committed terminal status before releasing the hold. Three
real PostgreSQL injected-failure cases reproduced stranded balances. Each pair
now commits in one transaction; retry and concurrency tests pass. This prevents
new partial writes, but does not reconcile historical balances. No production
credit was read or changed.

Three cross-tenant tests targeted missing routes and accepted server failures.
They now assert registered routes and valid authorization refusals; the old
probes fail the new guard, while corrected probes pass.

The observed usage panel zero was also reproduced from the API contract:
`/ai/usage` returns `costCents`, while the UI summed only `costUsd`/`cost` and
defaulted missing values to zero. The UI now converts explicit cents, preserves
explicit zero and marks missing/partial estimates unavailable. Its label states
organization-wide usage for the last 30 days, distinct from a project quota or
provider invoice. No amount is inferred from the user-reported token counts. The settings loader now
selects the project organization explicitly for both usage and billing; the API
checks that organization’s usage permission. Six prior-failing scope cases are
covered by the final 9 API and 53 panel tests, documented in
[the cost report](../ai-usage-cost-units-20261101.md).

## Restore reproduction and provenance

The local Docker daemon was checked explicitly at `/var/run/docker.sock`.
`postgres:16-bookworm` resolved to digest
`sha256:e8a07d2c7579b038938cdba6c539e580e5001caf9ea203d397b5cc83e76bd938`.
The standalone physical shell recipe ran as postgres, with `--network none`,
stdin script and `VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1`; PostgreSQL version 160015. A first bind-mounted-script invocation could not read its mount; stdin
execution fixed that fixture setup without changing product or permissions.

Control DB migrations used the existing CI pgvector digest
`sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`,
with dedicated loopback database on port 55437. All migrations applied. Direct
Vitest invocation avoided pnpm's attempted reinstall into an unavailable home
store. The first restore test run had 39 database skips; rerunning with the
explicit disposable `RESTORE_TEST_DATABASE_URL` passed all 39 without skips.

The full physical harness used its existing pinned local image ID `9b05db12…`,
which is the cached image obtained from that CI digest. Root tsx resolution
needed a temporary config mapping `@vibecore/*` to `packages/*/src/index.ts`;
no dependency manifest was changed. An initial full run failed closed because
`DB_ROLLBACK_ENABLED` was absent. Setting it only for the isolated harness
process produced the final successful result. No deployment setting changed.
The full drill repeats 30 repository cases already counted above.

Commands (database URL is the disposable fixture only):

```sh
cd services/api
../../node_modules/.bin/vitest run --config vitest.config.ts \
  src/database-restore-executor.spec.ts src/tests/database-restore-source.spec.ts \
  src/tests/database-restore-routes.spec.ts src/tests/database-restore-integrity.spec.ts
RESTORE_TEST_DATABASE_URL='<dedicated-loopback-fixture>' ../../node_modules/.bin/vitest run \
  --config vitest.config.ts src/tests/database-restore-consumer.spec.ts \
  src/tests/database-restore-repository.spec.ts
# At repository root, with the temporary workspace resolution config:
DB_ROLLBACK_ENABLED=true TSX_TSCONFIG_PATH=/tmp/launch-proof-tsconfig.json \
  RESTORE_QA_OUTPUT=/tmp/launch-restore-full-final node --import tsx \
  scripts/qa/database-restore-physical.ts
```

## Access limits / precise next authorization

No operation was denied by automatic approval review in this audit. No access,
credential, network policy, production state or paid infrastructure was changed.
The executor reports enforced restricted networking, zero secret bindings,
zero runtime variables and zero outbound identities. Stripe and cloud-production
proofs are **not attempted / unavailable**, not failed payments or failed backups.
The separate coordinator may already possess suitable authorized access.

If it does not, the precise prerequisite is an existing Stripe **test-mode**
integration and a dedicated synthetic CNPG/GCS source/target/archive with existing
read/restore permissions. Any new permission, credential, network destination or
paid resource requires separate approval; none is requested implicitly by this
report. Production load remains unauthorized by this task.
