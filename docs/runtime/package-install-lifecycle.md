# Packages panel synchronous installation

The Packages panel sends a single install request, explicitly allowing the existing five-minute command budget (300,000 ms). Its API-to-agent request allows 330,000 ms and its web-to-API request 360,000 ms for dispatch and response overhead. Ordinary API requests retain their 30-second default, ordinary agent hops retain their 15-second default, and audit/outdated commands and test deadlines are unchanged.

Package installation is a mutating command. The API makes only one agent attempt. A timeout or lost connection can happen after execution has started, so the API must not replay the command or switch to local execution after an agent failure. Local fallback remains allowed only when the workspace manager fails before agent dispatch and local fallback is enabled.

If the install response is lost, or does not contain a command exit status, the panel records the failed observation with exit-code sentinel -1 and `outcomeUnknown: true`. It returns `PACKAGE_RUN_OUTCOME_UNKNOWN` with localized guidance to check the workspace terminal and installed packages before retrying. This is not proof the command stopped, failed, or installed nothing. A returned command exit status is preserved. There is no automatic retry or claim of cancellation.

This bounded synchronous contract does not add operation IDs, polling, deduplication across separate user submissions, or recovery of a lost result. A proxy with a shorter deadline can still interrupt observation; check actual ingress/service budgets before production rollout. Independent requests or manual retries can still overlap. Cold workspace/manager preparation can consume the response reserve. Production behavior remains unverified until the real runtime acceptance scenario passes.

Regression checks:

- `node node_modules/vitest/vitest.mjs run 'app/routes/api.projects.$projectId.ide-panel.execution-outcomes.spec.ts'`
- `node --test scripts/ci/package-install-lifecycle.checks.mjs`

The latter executes the actual extracted agent-request implementation with controlled dependencies and also guards install call-site policy. It does not execute an installation or substitute for live Kubernetes acceptance.

## Audit failure evidence

A failed Packages UI install keeps the existing 60-second POST wait and fails the same acceptance assertion. Its diagnostic now records only HTTP status, an allowlisted result code, bounded exit code, outcome category, and an allowlisted error-code hint. It never retains raw response messages, command output, IDs, or URLs. Diagnostic waiting is bounded to one second; it does not cancel the underlying Playwright response-body read. A declared Content-Length above 64 KiB skips that read. Otherwise response.text() materializes the body before the 64 KiB parsing/retention check, so absent, compressed, or inaccurate length metadata does not provide a memory/read-size bound. The retained projection contains only fixed categories and bounded numbers and stays below 512 UTF-8 bytes. Unavailable diagnostics still fail the install check. A reported error-code hint is not a proven root cause. No retry or additional install is performed.

Run `node --test scripts/ci/package-install-evidence.checks.mjs scripts/audit-ide-panels-selectors.checks.mjs` to check the projection and actual audit callback with controlled responses. These checks do not establish a successful live installation.

The normal Packages 422 branch contains only a run ID/status/exit code and localized error text (command output tail limited to 400 characters, or a fixed unknown-outcome message). This is not a universal HTTP body bound: other errors and intermediary responses can bypass that branch. The diagnostic therefore does not assume all responses satisfy the normal branch shape.
