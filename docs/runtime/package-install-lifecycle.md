# Packages panel synchronous installation

The Packages panel sends a single install request, explicitly allowing the existing five-minute command budget (300,000 ms). Its API-to-agent request allows 330,000 ms and its web-to-API request 360,000 ms for dispatch and response overhead. Ordinary API requests retain their 30-second default, ordinary agent hops retain their 15-second default, and audit/outdated commands and test deadlines are unchanged.

Package installation is a mutating command. The API makes only one agent attempt. A timeout or lost connection can happen after execution has started, so the API must not replay the command or switch to local execution after an agent failure. Local fallback remains allowed only when the workspace manager fails before agent dispatch and local fallback is enabled.

If the install response is lost, or does not contain a command exit status, the panel records the failed observation with exit-code sentinel -1 and `outcomeUnknown: true`. It returns `PACKAGE_RUN_OUTCOME_UNKNOWN` with localized guidance to check the workspace terminal and installed packages before retrying. This is not proof the command stopped, failed, or installed nothing. A returned command exit status is preserved. There is no automatic retry or claim of cancellation.

This bounded synchronous contract does not add operation IDs, polling, deduplication across separate user submissions, or recovery of a lost result. A proxy with a shorter deadline can still interrupt observation; check actual ingress/service budgets before production rollout. Independent requests or manual retries can still overlap. Cold workspace/manager preparation can consume the response reserve. Production behavior remains unverified until the real runtime acceptance scenario passes.

Regression checks:

- `node node_modules/vitest/vitest.mjs run 'app/routes/api.projects.$projectId.ide-panel.execution-outcomes.spec.ts'`
- `node --test scripts/ci/package-install-lifecycle.checks.mjs`

The latter executes the actual extracted agent-request implementation with controlled dependencies and also guards install call-site policy. It does not execute an installation or substitute for live Kubernetes acceptance.
