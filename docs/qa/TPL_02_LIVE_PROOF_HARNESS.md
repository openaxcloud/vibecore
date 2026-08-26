# TPL-02 live proof harness

This harness produces executable evidence for `TPL-02.PROOF` and an optional
before/after proof for `TPL-02.6`. It does not change either tracker and it does
not make a proof green merely because the test code exists.

The runner uses the real web application, API, workspace runtime, deployment
worker, static publisher, PostgreSQL-backed project model, and Gallery remix
pipeline. It has no mocked provider, runtime, deployment, or authentication
path.

## What a passing run proves

Three separate tests exercise the following paths:

1. `/projects/new` — a real AI prompt creates a `sourceType=ai` project.
2. `/import-zip` — the browser uploads a real Vite ZIP and creates a
   `sourceType=zip` project.
3. `/gallery/:slug` — explicit license consent creates a real
   `sourceType=duplicate` project from a pinned Gallery release.

For each project the runner then:

- opens `/projects/:id/ide` and waits for `Workspace: running`;
- opens the runtime `Preview` webview;
- rejects a blank or zero-area preview;
- uses a fixture-specific control and verifies its state transition;
- calls the real `POST /projects/:id/deployments` route;
- polls the real deployment row until `READY` (and fails on `FAILED`,
  `CANCELED`, timeout, quota, credit, or provider errors);
- calls `POST /projects/:id/deployments/:deploymentId/publish` and requires a
  `READY/production` row;
- opens the public URL without a session, requires HTTP 200, and repeats the
  functional interaction;
- captures the IDE Preview and public app;
- stops every runtime workspace belonging to the revalidated QA project;
- permanently deletes only that attributed QA project, proves its API now
  returns 404, and waits until its published URL no longer returns 200.

The output is `test-results/tpl-proof-<run-id>/report.json` plus PNG captures and
Playwright failure traces. A report concludes `passed` only when all three flows
pass and all three cleanup checks pass.

## Destructive-run guard

Test discovery itself fails unless all required inputs are explicit. There is no
default account, organization, Gallery fixture, or production origin.

Required for every run:

```bash
export TPL_PROOF_RUN=1
export TPL_PROOF_TARGET=local                    # local | prod
export TPL_PROOF_RUN_ID=qa-20260826-001          # unique, lowercase, 8-40 chars
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173
export PLAYWRIGHT_API_URL=http://127.0.0.1:3001

# Existing dedicated QA account. The harness never registers a user or org.
export TPL_PROOF_USER_EMAIL='...'
export TPL_PROOF_USER_PASSWORD='...'
export TPL_PROOF_USER_MFA_CODE='...'             # only when that account requires MFA
export TPL_PROOF_USER_ORG_ID='...'

# Existing, remixable, runnable Gallery fixture.
export TPL_PROOF_REMIX_SLUG='...'
export TPL_PROOF_REMIX_READY_SELECTOR='[data-proof="ready"]'
export TPL_PROOF_REMIX_ACTION_SELECTOR='[data-proof="action"]'
export TPL_PROOF_REMIX_RESULT_SELECTOR='[data-proof="result"]'
export TPL_PROOF_REMIX_INITIAL_RESULT_TEXT='0'
export TPL_PROOF_REMIX_RESULT_TEXT='1'

# Make the TPL-02.6 decision explicit, even when it is not part of this run.
export TPL_PROOF_INCLUDE_IBAN=0
```

The selected user must be a real member of `TPL_PROOF_USER_ORG_ID`, and that org
must be the account's first organization because the three browser creation
routes use the product's `firstOrganization()` destination. The harness verifies
both facts before it can create anything. That org must be dedicated to this run
and have sufficient project, AI, deployment, and published-project entitlement.
The runner does not grant credits, change plans, register disposable identities,
disable MFA/SSO, or bypass a quota. A real 401, 402, 403, 409, or 429 is retained
as a failed proof with its typed API code.

Local mode rejects any app or API hostname other than `localhost`, `127.0.0.1`,
or `::1`. It never starts an implicit stack: the operator must start the intended
full stack first.

Run it with:

```bash
pnpm run test:e2e:tpl-proof
```

## Production mode

Production requires HTTPS origins, the same explicit user/org/fixture inputs,
and the exact acknowledgement below:

```bash
export TPL_PROOF_TARGET=prod
export PLAYWRIGHT_BASE_URL=https://app.e-code.ai
export PLAYWRIGHT_API_URL=https://api.e-code.ai
export TPL_PROOF_PROD_ACK=I_UNDERSTAND_THIS_RUN_CREATES_PUBLISHES_AND_DELETES_QA_PROJECTS
```

Do not run this against production until the target SHA is deployed and a
dedicated QA account, org, Gallery fixture, credits, deployment worker, runtime,
and publisher have been confirmed. Supplying the acknowledgement authorizes the
listed QA project lifecycle only; it does not authorize modifying or deleting
any pre-existing project.

## TPL-02.6: real IBAN before/after

Set `TPL_PROOF_INCLUDE_IBAN=1` and provide a pre-curated QA fixture. The admin
account must both be a real platform admin and have legitimate access to export
the named source project. The runner logs in normally, verifies `/auth/me`, and
performs `/auth/reauth`; it never impersonates the owner or uses an internal
secret. The admin/source account and remixer account must be distinct, otherwise
the run is refused before discovery (an owner self-remix is not a masking proof).

```bash
export TPL_PROOF_INCLUDE_IBAN=1
export TPL_PROOF_ADMIN_EMAIL='...'
export TPL_PROOF_ADMIN_PASSWORD='...'
export TPL_PROOF_ADMIN_MFA_CODE='...'             # when required
export TPL_PROOF_IBAN_SLUG='...'
export TPL_PROOF_IBAN_SOURCE_PROJECT_ID='...'
export TPL_PROOF_IBAN_SOURCE_PROJECT_NAME='TPL IBAN proof fixture'
export TPL_PROOF_IBAN_FULL_VALUE='FR76 3000 6000 0112 3456 7890 189'
export TPL_PROOF_IBAN_TRAILING_FRAGMENT='189'
export TPL_PROOF_IBAN_SAFE_MARKER='TPL_IBAN_FIXTURE_20260826'
```

The proof fails unless all of these statements are true:

- the authorized source export contains the complete configured IBAN;
- the source and clone both contain the non-PII release marker;
- the public listing declares the fail-closed `MASKED` policy;
- the clone contains `[PII:iban masked on remix]`;
- neither the complete IBAN nor its configured terminal fragment survives.

The source project and listing are read-only fixtures and are never deleted.
Only the newly attributed clone is deleted. The older local
`gallery-remix-license.spec.ts` uses the same discriminating assertion so a
mutation that restores the historical trailing-group leak fails both proof
paths.

## Cleanup attribution

Before every flow the harness snapshots every project id in the dedicated QA
org. It will delete a project only when all checks agree:

- its id was absent from the pre-flow snapshot;
- its organization is the configured QA org;
- its `sourceType`, name or name prefix, and creation time match the active
  flow;
- an exact `GET /projects/:id` immediately before deletion returns that same
  identity;
- `confirmName` matches the current project name.

Ambiguous attribution fails closed. The harness will not guess which project to
delete. Use a unique run id and do not run concurrent work in the dedicated QA
org.

## Non-mutating validation

These commands validate the harness without touching an application stack:

```bash
pnpm exec vitest run scripts/qa/tpl-proof-contract.spec.ts
pnpm exec tsc --project tsconfig.scripts.json --noEmit

# Must fail before discovery when TPL_PROOF_RUN is absent.
pnpm exec playwright test --config=playwright.tpl-proof.config.ts --list
```

A real local or production execution is still required before either tracker can
be marked live-tested.
