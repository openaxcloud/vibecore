# Ephemeral GitHub runtime validation

This test-only branch is based on main `af0ea860e8e7ca3c5cc6231143cec927f855ec97`.
It includes the two previously verified local CI-verdict patches (transfer SHA-256
`edb5c0ab121b8412f2c330a5f4d68d75337da2f67f623b88b8cddd8e12148e19`).
It does not include or change PR #892. Nothing is merged or deployed by this workflow.

## Real execution path

The dedicated Ubuntu GitHub-hosted VM runs a fresh single-node k3s cluster with
local-path persistent volumes and the actual gVisor runtime. Official versioned
k3s and gVisor downloads are checksum-verified before execution. A real sandbox
probe must expose the gVisor kernel banner; a RuntimeClass declaration is not
accepted as sufficient evidence.

The actual workspace-agent Dockerfile is built from this commit and loaded into
the local containerd image store, never pushed to a registry. The normal API,
Postgres-backed workspace manager and agent run unchanged. The manager provisions
normal gVisor workspace pods, services, secrets and PVCs. A CI-only loopback
transport router resolves each real Kubernetes Service and forwards HTTP and
WebSocket bytes, without generating any runtime response. It avoids changing
host DNS settings. Preview uses the API's existing authenticated per-workspace
preview proxy; this is not a production wildcard/TLS/HMR validation.

The normal sandbox runtime scheduling remains enabled. Production network
policies and cloud integrations are not installed: this is an isolated runner,
not a proof of production networking or tenant isolation. A guarded after-test hook stops completed-test workspaces through the real manager
to bound CPU/memory use. It is a no-op outside the explicit disposable-runner flag.
Existing manager GC also reclaims workspaces inactive for five minutes; active IDE
requests renew activity.

## Verdict and coverage

All original 18 `@runtime` scenarios and their assertions remain unchanged. The
only original-spec edits add the guarded teardown import and hook.
Two additional static/Vite preview preflight cases gather evidence against the
current status-bar DOM; they do not replace the original cases. The full suite
uses zero retries and no failure-count short circuit. The IDE audit is attempted
after an executed runtime suite even if it fails, and its report validator runs
even when the audit command fails. Failure stays failure.

The previous running-status selectors are known to differ from the current UI.
They deliberately remain unchanged for the first real run so its failure evidence
can be inspected before any assertion update. A successful preflight does not
mean the 18-case suite or full IDE audit passed.

No paid provider keys are passed to this job. Because opening the draft PR also
triggers ordinary E2E, the existing provider-key expressions there explicitly
resolve to empty only for this exact test branch. Other branches/main behavior
and required gates are preserved. An AI-related failure without a provider key
must be reported honestly, never mocked into success.

## Boundaries and evidence

- Only `contents: read`; no cloud authentication, external cluster, deployment,
  registry push, main update, bypass or protection change.
- Three independent random internal credentials are generated for this disposable
  stack, masked in logs and never persisted outside the runner.
- Artifacts retain for one day and include only an explicit allowlist of redacted
  text diagnostics, safe Kubernetes summaries and UI error snapshots. Each file
  is capped at 256 KiB and total output at 20 MiB. Raw network traces, secrets and
  kubeconfig are excluded.
- Cluster namespace and local dependency volumes are removed at job completion.
  The GitHub-hosted VM is disposable even if a job is cancelled.

Local checks and the exact remote run/result will be recorded after execution.
No browser runtime pass or production readiness is claimed by this document.

## Local validation before first launch

- Frozen pnpm 9.14.4 install succeeded on Node 24.22.1.
- Router transport tests: 7 passed, including HTTP, WebSocket, invalid routing,
  failed lookup and bounded timeout.
- Runtime workflow/inventory guards: 12 passed (6 + 6).
- New TypeScript harness/config strict targeted typecheck passed.
- New harness/config targeted ESLint and Prettier checks passed.
- Shell syntax, JavaScript syntax, cleanup helper bundle and git diff checks passed.
- Playwright list: 18 original runtime cases in five files; two preflight cases
  in a separate config. Listing is not browser execution.
- No local Docker/kubectl is available, so cluster provisioning, image build,
  full web build and browser behavior remain for the authorized remote run.
