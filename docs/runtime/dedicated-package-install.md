# Dedicated package installation

Packages installs use the authenticated workspace agent routes `GET /packages/v1/capabilities` and `POST /packages/v1/install`. The capability must report `{ version: 1, maxBudgetMs: 300000, validatedSpecs: 1 }` before the API dispatches exactly one installation. An older or incompatible agent returns `409 PACKAGE_INSTALL_CAPABILITY_REQUIRED` without an install, fallback or automatic workspace restart.

The install body contains only `packageManager`, `packages`, `dev` and `timeoutMs`. Supported npm, pnpm, yarn and bun specifications remain separate argv values; `command`, `args`, `cwd`, `env`, `background` and `operationId` are not accepted. The existing workspace root, authentication, project permissions, workspace/project match, terminal revocation, abuse checks, process slots, sanitized child environment and resource limits still apply. Lifecycle scripts retain their existing behavior. Source selectors are not a sandbox boundary.

## Deadlines and results

- Installation execution is capped at 300 seconds. Generic commands keep their existing 30-second cap.
- The API has one cumulative installation budget plus 30 seconds, at most 330 seconds, beginning before capability discovery. Capability discovery is additionally limited to 10 seconds. Token, capability and installation response bodies remain under the same cancellation budget after headers arrive.
- The web Packages request has a 360-second signal. Other web API calls keep their existing default.
- Timeout sends TERM to the process group, then KILL five seconds later if necessary. Explicit stop uses the same five-second escalation and a ten-second confirmation window. A graceful zero exit after explicit stop is still an interruption; the observed exit code and signal are not fabricated.
- A spawn error has no observed exit code and remains unknown. Output-limit termination stays interrupted even if the child then exits zero.
- A lost response remains an unknown result. It is not retried and cannot trigger local execution, a second POST or success. Inspect the actual workspace before starting a separately requested retry.
- Process admission is rechecked after the final await before synchronous spawn/registration in both ordinary and streamed runners. A concurrent terminal launch cannot take a slot already consumed by an installation.

The dedicated API transport intentionally does not change generic manager or agent retry behavior. Existing EN/FR error localization is reused. No experimental process telemetry, dashboard tests or temporary runtime deployment workflow is required.

## Verification

CI runs `node --test scripts/ci/package-dedicated-install.checks.mjs scripts/ci/package-install-i18n.checks.mjs scripts/ci/package-transport.checks.mjs scripts/ci/package-install-import.checks.mjs` and `pnpm exec tsc --project tsconfig.package-install.json --noEmit`. The existing API integration suite also asserts the capability and exact structured body, single POST, wrong-workspace refusal, invalid package refusal and old-agent refusal. Focused source and fixture checks do not replace that full suite or runtime acceptance.

The Packages scenario in `scripts/audit-ide-panels.mjs` now requires all of: successful installation response, actual page reload, visible `is-odd` package row, a persisted succeeded run with exit 0 and no termination, and a real Node import inside that same workspace. The import checks `isOdd(3) === true` and `isOdd(4) === false`. It never installs anything or retries. The ordinary command cap is unchanged; the fixed import probe requests 10 seconds.

Run acceptance only in a newly created, disposable test project/workspace with no existing `is-odd` installation. Use the repository's authorized Kubernetes audit environment and the ordinary `node scripts/audit-ide-panels.mjs` entry point. The full audit also exercises other panels, so do not point it at a user's existing project. Retain the exact tested commit and image digests, successful install response, persisted run after reload, and successful fixed import assertion. Do not treat a mock fixture, local offline npm test, package manifest alone or failed/incomplete audit as a production runtime pass.

## Deployment order and existing workspaces

1. Validate the precise release commit with required CI and repository protections intact. Build and make the compatible workspace-agent image available before enabling its consumer in production.
2. Pin the verified agent digest using the normal deployment process. `deploy-main.yml` records `workspaceAgentImage` in the runtime configuration, but workspaceAgent is not a rolled Helm Deployment. Deployment imageID checks therefore do not establish that existing workspace pods have been updated.
3. Start a **new disposable** workspace through the normal quota/admission lifecycle. Verify its authenticated capability and perform the installation/reload/import recipe above against the exact image and API/web release.
4. Existing active agents remain on their current images. Incompatible agents fail cleanly before installation. Migration of active workspaces needs a separately planned and authorized lifecycle operation. Start/reprovision may restart a container or recreate a pod and interrupt processes even when the PVC is retained.

This change does not restart, destroy or modify any existing workspace, configure a provider or object-storage credential, grant permissions or create a paid service. There is no hot migration and no automatic restart fallback.
