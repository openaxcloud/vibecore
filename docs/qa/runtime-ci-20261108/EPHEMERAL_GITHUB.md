# Ephemeral GitHub runtime validation

This test-only branch is based on main `af0ea860e8e7ca3c5cc6231143cec927f855ec97`.
It includes the two previously verified local CI-verdict patches (transfer SHA-256
`edb5c0ab121b8412f2c330a5f4d68d75337da2f67f623b88b8cddd8e12148e19`).
It does not include or change PR #892. Nothing is merged or deployed by this workflow.

## Real execution path

The dedicated Ubuntu GitHub-hosted VM runs a fresh single-node k3s cluster with
local-path persistent volumes and the actual gVisor runtime. Official versioned
k3s comes from its official `rancher/k3s` OCI image pinned by digest. The image is
never started: its runtime files are extracted and verified against a complete
release-derived manifest (file hashes, modes and symlink targets), then staged with
the launcher’s required PATH and CNI layout. gVisor release downloads are verified
against both official checksums and a pinned digest before execution. A real sandbox
probe must expose the gVisor kernel banner; a RuntimeClass declaration is not
accepted as sufficient evidence.

The actual workspace-agent Dockerfile is built from this commit and loaded into
the local containerd image store, never pushed to a registry. The normal API,
Postgres-backed workspace manager and agent run the product code under test. The manager provisions
normal gVisor workspace pods, services, secrets and PVCs. A CI-only loopback
transport router resolves each real Kubernetes Service and forwards HTTP and
WebSocket bytes, without generating any runtime response. It avoids changing
host DNS settings. Preview uses the actual preview-proxy service on loopback port 3020 with
workspace-specific localhost hostnames; this is not a production wildcard/TLS/HMR
validation.

The workspace pod derives Vite's browser HMR protocol and client port from the
configured public preview URL. HTTPS retains WSS and its public port; the local
HTTP proxy uses WS on port 3020. A dynamic public `{port}` leaves the port to
Vite's browser-side URL inference. Without a custom template, the existing
WSS/443 default is retained. No host override or production TLS bypass is added.

The normal sandbox runtime scheduling remains enabled. Production network
policies and cloud integrations are not installed: this is an isolated runner,
not a proof of production networking or tenant isolation. A guarded after-test hook stops completed-test workspaces through the real manager
to bound CPU/memory use. It is a no-op outside the explicit disposable-runner flag.
Existing manager GC also reclaims workspaces inactive for five minutes; active IDE
requests renew activity.

## Verdict and coverage

All original 18 `@runtime` scenarios retain their coverage and intent. Original
specs add guarded teardown and update only selectors/contracts verified against
the current interface: running-workspace controls, canonical project URLs, the
agent prompt, Shell controls and the actual queued default-model state.
Two additional server-backed static/Vite preview preflight cases require an
actual pod-hosted URL and exact application content; they do not replace the
original cases. Raw package-free HTML intentionally uses the IDE’s local srcdoc
preview, so the static runtime fixture declares a real Node HTTP dev server.
The URL check waits for server readiness rather than treating an immediately
visible local fallback as a running pod preview. The full suite
uses zero retries and no failure-count short circuit. The IDE audit is attempted
after an executed runtime suite even if it fails, and its report validator runs
even when the audit command fails. Failure stays failure.

Selector repairs follow failure evidence and current source contracts. They do
not skip tests, relax timeouts or supply synthetic success. A successful preflight
does not mean the 18-case suite or full IDE audit passed.

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
  is capped at 256 KiB, each of the preflight/final artifacts at 10 MiB, and their
  combined output at 20 MiB. Raw network traces, secrets and
  kubeconfig are excluded.
- Cluster namespace and local dependency volumes are removed at job completion.
  The GitHub-hosted VM is disposable even if a job is cancelled.

Desktop failure evidence records bounded structural state, startup phases and
categorized resource/error counts before page cleanup, without raw URLs, input
values or page text. It is limited to 64 KiB and a three-second capture deadline;
the original test failure is always rethrown.

Immutable-pod recreation diagnostics expose only fixed changed-field categories
and an environment-ordering boolean. They never expose environment names,
values, hashes or manifests. The extra Kubernetes read is cancelled after one
second and cannot prevent normal recovery. API evidence separately retains at
most 60 recent IDE-state failures, using a fixed route category, method, status
and timestamp, without project identifiers or query strings. These observations
do not suppress browser errors or turn failed audit controls into passes.

Local checks and the exact remote run/result will be recorded after execution.
No browser runtime pass or production readiness is claimed by this document.

## Legacy project layout compatibility

When the first development workspace has no IDE state, its first authorized
state read or write initializes only the saved project UI. An existing workspace
state, including an intentionally empty state, wins. Secondary and production
workspaces do not inherit it; chat remains project-scoped. The insertion ignores
conflicts and rereads the stored winner for its version and ETag. Subsequent
project-only windows do not overwrite an initialized workspace layout.

The runtime job exercises this storage path against its migrated local PostgreSQL
before starting the app, including concurrent initializers and an uncommitted
competing writer. That proof uses an isolated UUID fixture and removes it afterward.

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

## First remote observations

Run 42460924763 was rejected before runner allocation because `runner.temp` is not
available in job-level env. Corrected by writing KUBECONFIG to GITHUB_ENV after
runner allocation; actionlint then passed.

Run 42461071358 installed dependencies and passed all 13 harness checks (7 transport
and 6 workflow). Both official Kubernetes and gVisor binaries passed release and
pinned digest checks. Bootstrap reached the Kubernetes API but `get nodes` returned
an empty successful list before node registration, and `kubectl wait --all` failed
with no matching resources. No browser test ran. Artifact upload succeeded (6,807
bytes, one-day retention). Bootstrap now explicitly waits for a nonempty node list
and for the local-path deployment to exist.

Preflight files use a dedicated `.pw.ts` extension and config so neither ordinary
Playwright E2E nor root Vitest accidentally discovers these cluster-only tests.

Run 42461328168 successfully provisioned Kubernetes and built/imported the real
workspace-agent image. The gVisor probe could not create its sandbox: the pinned
release has split helper binaries, and `gvisor-bin/gvisor_sentry` was not installed
beside runsc. The complete verified release layout is now installed. No browser
test ran; the bounded diagnostic artifact was 25,348 bytes with one-day retention.
Evidence redaction also now covers K3s join tokens and private-key blocks, with
seven dedicated regression tests, before any diagnostic text is uploaded.
The web build explicitly selects `remote-kubernetes`; without this setting the
development default would exercise WebContainer rather than the provisioned pods.
