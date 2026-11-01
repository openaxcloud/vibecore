# Post-deployment provider evidence: Stripe sandbox and CNPG/GCS

Prepared 1 November 2026. **Recipes, not executed provider proofs.** No cloud,
Stripe, production, credential or permission action was performed to prepare
this document. No denied artifact download was retried. Existing local results
are in [billing](../launch-20261101/billing.md) and the
[launch matrix](../launch-20261101/README.md); they cannot replace these checks.

## Preconditions and stop conditions

The current task environment reported **zero configured secrets, runtime
variables and outbound identities**, with restricted enforced networking and
no configured VPN. There is no configured Stripe sandbox or CNPG/GCS test
integration here. GitHub/package access is not Stripe/cloud authorization.
Do not invent credentials, read secret files, request new access, alter policy,
turn on billing/restore flags or create paid infrastructure to run this recipe.
These are prerequisites for a later operator using an already authorized test
integration; they are not requests to change this environment.

Before either exercise, record the deployed commit, actual image digest(s), UTC
start, operator, run ID and exact isolated resource IDs in a private manifest.
Confirm the commit includes the reviewed fixes and its exact CI is green. Use
synthetic users/projects/data only, an existing test namespace/bucket prefix and
a previously approved budget. No live card, live Stripe event, production
backup, customer database, broad deletion or production load is permitted.
If target identity or test mode is uncertain, stop before mutation. Persist only
redacted outcomes, IDs, counts, timestamps and hashes, never connection URIs,
Authorization headers, keys, raw webhook payloads or customer information.

## A. Stripe: bounded sandbox sequence

Use the existing authenticated test UI/API client and existing provider test
integration. Verify sandbox/test mode in the provider console and on the actual
customer, price, checkout and webhook event (`livemode=false`); do not infer mode
from key presence or the API health check. Session IDs and provider callbacks
must belong to the run's synthetic organization. An existing test deployment whose email delivery is already routed to an
authorized test sink is a prerequisite; do not change delivery settings here.

Read these application endpoints before mutation:

- `GET /billing/:orgId`: persisted catalogue, requiring `billing:read`.
- `GET /orgs/:orgId/billing`: effective subscription/plan.
- `GET /orgs/:orgId/credits` and `GET /orgs/:orgId/usage`: wallet/usage baseline.
- Existing authorized administrator only: `GET /admin/stripe-config`,
  `GET /admin/stripe-health`, `GET /admin/stripe/webhook-failures`.
  Health performs a provider balance read; it is not a payment test.

Confirm persisted pro/team monthly and annual IDs match sandbox product,
currency, amount and recurring interval. Do not use
`scripts/seed-stripe-catalog.mjs` to repair an unexplained mismatch: it mutates
the catalogue. No amount is inferred from an old marketing or credit-plan name.

Requests below are literal API contracts, to be sent only through that test
client; substitute manifest IDs and approved test return URLs:

```text
POST /orgs/:orgId/billing/checkout
{"planKey":"pro","interval":"monthly","successUrl":"<test-return-url>","cancelUrl":"<test-cancel-url>"}

POST /orgs/:orgId/billing/checkout
{"planKey":"pro","interval":"annual","successUrl":"<test-return-url>","cancelUrl":"<test-cancel-url>"}

POST /orgs/:orgId/credits/packs/checkout
{"packId":"pack-100","successUrl":"<test-return-url>","cancelUrl":"<test-cancel-url>"}
```

Use a separate synthetic organization for monthly/annual cases to avoid
accidentally measuring overlapping subscriptions. Complete checkout with the
provider's supported sandbox payment instrument. Let the provider deliver its
real signed event to `POST /billing/stripe/webhook`; do not replace this with
manually fabricated JSON or local signing. Poll the existing test integration's
bounded delivery/status mechanism (maximum five minutes per case); timeout is
failure, not a reason to repeat checkout. Reconcile the stored provider session
before retrying an uncertain request, to avoid creating another subscription.

| ID | Exercise | Pass evidence / failure condition |
|---|---|---|
| S1 | Pro/team configured price paths; monthly and annual checkouts | Actual sandbox line-item price, currency, interval and amount equal persisted catalogue; annual never falls back to monthly. Missing annual price refuses before provider checkout. A mismatch or silent fallback fails. |
| S2 | Completed subscription and invoice | One customer mapping and expected subscription/entitlement after signed delivery; provider invoice and stored invoice/usage IDs correlate. Checkout redirect alone is insufficient. |
| S3 | Replay identical signed successful delivery twice, including concurrent resend using provider-supported delivery controls | Same event/session yields no second subscription grant or pack; retained receipt and balance agree. Two HTTP200 replies alone are insufficient. If provider controls cannot exercise concurrency, record that row unproved; use local PG races only as complementary evidence. |
| S4 | One pack purchase, then replay after local test usage consumes part/all | Exactly one pack, unchanged original purchased amount and expiry, no balance refill after retry. Requires `BILLING_CREDITS_ENABLED` already true and configured sandbox pack price. Otherwise 503 `CREDIT_PACKS_DISABLED`/missing price is a correct guard, not purchase success. |
| S5 | Sandbox invoice failure followed by payment recovery for same subscription | Current application behavior sets the matching subscription to PAST_DUE on failure, while `billingState` still includes PAST_DUE among paid entitlement states: this is grace behavior, not immediate cutoff. Record that transition and require an explicitly agreed commercial grace/cutoff policy before declaring it correct for launch. Recovery applies only to the matching subscription; an old/foreign invoice must not reactivate another subscription. Use the sandbox's supported failure/retry flow; no production fault injection. |
| S6 | Provider renewal and application monthly allowance boundary (two separate proofs) | An existing supported Stripe sandbox test clock may exercise provider renewal and signed delivery; it does not advance application `Date.now()` or establish a monthly allowance reset. Verify allowance once at a real application period boundary, or in a pre-existing isolated clock-controlled fixture explicitly identified as local evidence. Without either, mark the application-boundary criterion unproved even if provider renewal passes. Annual billing must remain annual; duplicate delivery must not double allowance. Do not alter shared application/system time or create a new clock-control mechanism for this exercise. |
| S7 | Cancellation, delayed/out-of-order earlier event | Cancellation removes entitlement at the intended effective time; stale update does not resurrect it. Record event creation and delivery timestamps. |
| S8 | Unpaid/canceled checkout and invalid signature | No credit granted before paid/no-payment-required completion; invalid signature rejected without state mutation. A local unsigned request tests only the guard, not provider delivery. |
| S9 | Two independent tenants | Other tenant cannot read/change billing or credits (401/403/404); legitimate owner's operation succeeds. No 500 counts as authorization enforcement. |

For S3/S4 retain a scoped read-only ledger/receipt comparison through existing
authorized test-database tooling if public surfaces cannot establish uniqueness.
Do not change balances or inject failures into a shared deployment. Application
failure/retry fault injection already has isolated PostgreSQL regressions;
repeat it there, not by interrupting production services.

**Stop/rollback:** any live-mode object, wrong tenant, duplicated grant,
inconsistent catalogue or unresolved delivery prevents paid-launch signoff.
Stop creating new test transactions, preserve IDs, reconcile provider and local
state read-only. Do not replay all failures, reset all balances or rollback a
schema to hide the discrepancy. A code rollback is a separate coordinator action
against a known compatible deployment, with no automatic database rollback.

**Idempotent cleanup:** list run-owned session/subscription/customer IDs first;
expire only still-open sandbox sessions and cancel only this run's still-active
sandbox subscriptions using existing controls. Already closed/canceled means
success. Reconcile an uncertain cancellation before another attempt. Keep invoice,
event and credit-receipt audit evidence. Synthetic app resources can be retired
only from the manifest after reconciliation; never delete shared catalogues or
replay state. An unavailable cleanup action remains an explicit outstanding item.

## B. CNPG/GCS: do not bypass the application cutover gate

Current code has **no production coordinator injection in `server.ts`**.
Both `POST /projects/:projectId/database/restore` and `/database/restores`
require a capable `databaseRestoreCoordinator`; an otherwise valid request
returns **503 `RESTORE_APPLICATION_CUTOVER_UNAVAILABLE`** before admission.
With the feature disabled it returns 404 `FEATURE_NOT_ENABLED`; missing database
409 `NO_DATABASE`; missing snapshot 404; invalid retention target 422 (or 403 for
ineligible plan). `GET /projects/:projectId/database` and
`/database/recovery-points` disclose capability; a historical COMPLETED row is
not verified application recovery. A snapshot's HTTP202 likewise means kickoff,
not verified archived bytes.

A current-release post-deployment check may prove these guards on the authorized
test project. **It cannot pass restoration success.** Do not toggle a flag or
inject a QA participant into production to make this exercise pass. The cloud
adapter and distributed fencing must be implemented, reviewed and deployed to
the isolated test integration first; no runnable cloud restore command exists
in this document because that implementation is genuinely missing.

Required adapter evidence, before target allocation:

1. Exact source Cluster/Backup UID, project, organization, environment and
   snapshot binding, including creation provenance for reused/truncated names.
   `inspectCnpgRestoreSource` only reads metadata and explicitly returns
   `archiveVerified:false`, `walContinuityVerified:false`.
2. Existing authorized GCS reader verifies actual archive bytes/manifest and
   continuous WAL through target time; retain object generation IDs/hashes.
   A completed CNPG Backup status or bucket listing does not prove this.
3. Durable operation/attempt journal; all mutating ports implement idempotence
   by operation ID and fencing by attempt token, per
   `services/api/src/database-restore-contract.ts`.
4. Exhaustive inventory of API/workspace/user-app pools and other consumers;
   admission closed, accepted queries drained, pools closed, and proof that
   old attempts cannot write or reopen admission. Lease expiry or one cooperative
   QA process is not distributed fencing.
5. Target UID/URI binding attested without logging URI; source system identifier
   alone is insufficient because clones share it. Verify application binding
   version and expected synthetic data digest before releasing any consumer.

After those prerequisites exist, create only run-owned synthetic rows A, record
an exact UTC recovery target, then write B after the target. Snapshot request:

```text
POST /projects/:projectId/database/snapshots
{"label":"<run-id>","environment":"development"}

POST /projects/:projectId/database/restore
{"snapshotId":"<verified-run-snapshot-id>","environment":"development"}

# Separate PITR case, within verified archive coverage and plan retention:
POST /projects/:projectId/database/restore
{"targetTimestamp":"<target-UTC-ISO8601>","environment":"development"}
```

Never send `environment:"production"`. Poll `GET /projects/:projectId/database`
for the exact recorded operation/evidence using a predeclared bounded timeout;
retain outcome and phase at timeout, do not allocate another target blindly.

| ID | Exercise | Pass evidence / failure condition |
|---|---|---|
| R1 | Current unavailable/disabled gate | Expected explicit refusal, no restore admission or new target. This passes only the guard, not recovery. |
| R2 | Valid test archive and PITR | Verified archive/WAL, target before B, restored A present and B absent; verify through ordinary application reads and after target restart. |
| R3 | Corrupt archive or missing WAL in a separate test copy | Rejected before binding publication/admission release. Original test archive preserved; never corrupt the source object. |
| R4 | Wrong tenant/project/environment or snapshot | Rejected without target/binding mutation; authorized positive control succeeds. |
| R5 | In-flight and queued queries from every registered consumer | No new admission; accepted work drained; every old pool closed before binding change. A slow or unreachable consumer keeps recovery fenced/unavailable. |
| R6 | Coordinator crash/restart and competing worker | Durable operation resumes only after old-attempt fencing attestation; exactly one binding publication, stale attempt/release rejected. Lease expiry alone fails. |
| R7 | Wrong target UID/system identity/digest/binding version | Verification fails with admission closed; no COMPLETED or `applicationCutoverVerified:true`. |
| R8 | Successful cutover and restart | Published version, verified target and all consumer acknowledgments agree; ordinary reads/writes reach restored target after release and remain correct after restart. |
| R9 | Source backup retained, recovery timing measured | Record actual last recoverable transaction time, request/admission/drain/verify/release timestamps and sample size. Do not infer contractual RPO/RTO from one run. |

**Failure/rollback:** preserve the original source, backups and journal. Keep
admission closed when target identity, fencing or binding outcome is uncertain.
Do not simply switch URI back: first attest stop/fencing of every attempt and
consumer, then use the reviewed coordinator's recovery procedure to verify the
chosen source/target and binding version before release. No admin force-unlock,
manual COMPLETED marker or secret overwrite is an acceptable recovery proof.

**Idempotent cleanup:** require a manifest of acknowledged created resource UIDs
and GCS object generations under the run-specific prefix. Re-read ownership,
operation status and all consumer bindings before retiring each disposable
target. If create outcome is uncertain, discover/reconcile first; do not delete
by name guess. Missing owned target is already cleaned. Never delete source
backups, shared prefixes, production objects or retained audit evidence. An
active/uncertain binding blocks target cleanup. No general recursive cloud delete
command is part of this recipe.

## Existing isolated harnesses (complementary, not cloud substitutes)

- `scripts/qa/database-restore-ci.ts`: strict `CI=true` and exact disposable CI
  database target validation, then repository/ownership regressions. Called by
  `.github/workflows/ci.yml`. Do not replace its guarded target with a cloud URI.
- `services/api/src/tests/database-restore-consumer.spec.ts`: run from
  `services/api` with the existing authorized disposable
  `RESTORE_TEST_DATABASE_URL`; missing variable skips tests and is not proof:
  `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/tests/database-restore-consumer.spec.ts`.
- `scripts/qa/database-restore-existing-postgres.sh`: opt-in
  `VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1`, verified local disposable PostgreSQL16
  container, private Unix sockets; basebackup/verifybackup/tamper/PITR/restart.
  Never run against a production container. Source PGDATA remains untouched.
- `scripts/qa/database-restore-physical.ts`: full local fixture requires its
  cached pinned image and uses QA-specific consumers; it does not implement
  CNPG/GCS or exhaustive production fencing.
- `services/api/src/credit-pack-postgres.integration.spec.ts` and
  `credit-reservation-postgres.integration.spec.ts`: existing workflow requires
  exactly ten real cases and zero skips; these prove transaction properties,
  not sandbox payments or production balances.

For every S/R row publish one of **passed**, **failed**, **not executed / missing
prerequisite**, with exact commit, manifest reference and redacted evidence.
Only all applicable positive and negative cases passing closes the respective
provider criterion. No aggregate percentage, local-to-production inference or
blanket launch approval follows from these recipes.
