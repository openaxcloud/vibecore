# Import connectors — real execution + proof (2026-07-20)

**evidenceId:** `docs/deploy-evidence/2026-07-20-import-connectors/`
**Branch:** `feat/import-connectors-parity`
**Scope:** make REAL and PROVEN the import-hub connectors that had no executing
path (plan §9, `IMPORT_PROVIDER_REGISTRY.yaml`). GitHub / Bitbucket / ZIP / Empty
were already executed by their own endpoints and are out of scope here.

## What was built

A new pure module `services/api/src/import-connectors.ts` sits in front of the
existing secure import pipeline (`import-pipeline.ts` + `POST /orgs/:orgId/imports`).
It adds, for every non-native provider:

1. **Capability declarations** — `CONNECTOR_CAPABILITIES` classifies each of the
   12 hub entries as `native` / `file-bundle` / `derived` / `external-api`.
2. **Input normalisation** — CSV/TSV → a runnable static project (spreadsheet);
   export-bundle wrapper-dir stripping (bolt / lovable / base44 / previous-agent-export).
3. **Security hardening applied at RECEIVED, before staging** — path traversal,
   symlink escape, archive-bomb (file-count / per-file / total-byte caps), and
   binary-declared-as-text detection. A hostile bundle is rejected with a typed
   422 **before any job is created or any target is written**.
4. **Honest BLOCKED** for external-api providers (vercel / figma / claude): a typed
   424 `CONNECTOR_CREDENTIAL_REQUIRED` — never a faked success.

The endpoint (`services/api/src/app.ts`, `POST /orgs/:orgId/imports`) calls
`prepareConnectorImport()` before staging; the full state machine
`RECEIVED → STAGING_ISOLATED → SCANNING → (QUARANTINED→AWAITING_USER_ACTION) → COMMITTING → COMMITTED`
is unchanged — disposable staging, no target touch before the atomic commit,
per-finding consent enforced.

## Results — proven vs blocked

| Provider | Class | Status | Proof |
|---|---|---|---|
| spreadsheet | derived | **PROVEN** | E2E commit + rendered app screenshot below |
| bolt | file-bundle | **PROVEN** | E2E commit (clean + secret+consent + no-consent block) |
| lovable | file-bundle | **PROVEN** | E2E commit (parametric) |
| base44 | file-bundle | **PROVEN** | E2E commit (parametric) + archive-bomb reject |
| previous-agent-export | file-bundle | **PROVEN** | E2E commit (parametric) |
| vercel | external-api | **BLOCKED** | needs the caller's Vercel access token (api.vercel.com deployment files API) — 424 |
| figma | external-api | **BLOCKED** | needs the caller's Figma PAT + a design-to-code step — 424 |
| claude | external-api | **BLOCKED** | Claude Design fetch source contract undefined + needs external credential — 424 |

## Reproduce

```bash
cd services/api
# 1. Pure unit tests (state controls, CSV parser, capability registry, orchestration)
../../node_modules/.bin/vitest --run --config vitest.config.ts src/import-connectors.spec.ts        # 38 passed

# 2. E2E through the real Fastify app — full state machine per connector
../../node_modules/.bin/vitest --run --config vitest.config.ts src/tests/import-connectors-e2e.spec.ts  # 13 passed

# 3. Non-regression on the pre-existing import suites
../../node_modules/.bin/vitest --run --config vitest.config.ts \
  src/tests/import-routes.spec.ts src/tests/connector-import.spec.ts \
  src/tests/zip-import-cleanup.spec.ts src/import-pipeline.spec.ts                                    # 32 passed

# 4. Strict CI-parity build (the same tsc invocation as `pnpm --filter @vibecore/api build`)
../../node_modules/.bin/tsc --outDir /tmp/apibuild --rootDir src --module NodeNext \
  --moduleResolution NodeNext --target ES2022 --lib ES2022 --types node \
  --skipLibCheck true --esModuleInterop true --strict true src/server.ts                              # 0 errors
```

Captured runs: [`unit-test-output.txt`](unit-test-output.txt), [`e2e-test-output.txt`](e2e-test-output.txt).

## Spreadsheet connector — rendered artifact (UI proof, not just API)

`spreadsheet-sample-output/` is the ACTUAL output of `buildSpreadsheetProject()`
for a CSV whose `revenue` column contains comma-quoted values (`"3,600"`). Serve
and open it:

```bash
cd docs/deploy-evidence/2026-07-20-import-connectors/spreadsheet-sample-output
python3 -m http.server 8199   # then open http://localhost:8199/index.html
```

The rendered page shows the `<h1>Q3 Product Sales</h1>` heading, a `3 rows × 3
columns` meta line, and a sortable table with the quoted `3,600` / `2,400` /
`1,350` values parsed correctly.

> **Note — bug caught by the UI proof (why API proof is not enough):** the first
> render showed `__APP_NAME__` literally in the `<h1>` because `String.replace`
> only substitutes the first match (the `<title>`). Fixed to `replaceAll`; the
> unit test now asserts both `<title>` and `<h1>` and that no placeholder remains.

## Non-negotiable invariants held

- **I-IMP-1 (no silent deletion):** scanning never mutates content; secrets are
  presented redacted and BLOCKING; redaction happens only on explicit per-finding
  consent. E2E `commit WITHOUT consent → 409`, `commit with consent → redacts only that line`.
- **I-IMP-2 (disposable staging, no target mount):** `writeCalls === []` asserted
  at RECEIVED, QUARANTINED, and on every rejected/blocked path.
