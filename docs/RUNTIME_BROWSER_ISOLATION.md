# Ephemeral runtime Chromium isolation

This configuration is limited to the approved disposable GitHub-hosted runtime workflow. Local preparation and unit checks do not create a container or change networking. It does not affect production.

The official Playwright 1.59.1 Ubuntu Noble Linux amd64 image is pinned to `sha256:eac9b0a5312cdab40ee8c2429df5bf19bffdccf8f3bf3c42268e173f97541645`. Public MCR registry verification matched its manifest digest header and SHA-256 of the response bytes. The tag index digest is `sha256:b0ab6f3cb99aa7803adbc14d9027ec1785fc6e433b97e134e0f8fe61683b6b53`; its amd64 child references config `sha256:fc1610b07935476ac20219b7911f6bbe47ac861523635845ba0bc7cc5f0277c4`.

Sources:

- https://mcr.microsoft.com/v2/playwright/manifests/v1.59.1-noble
- https://mcr.microsoft.com/v2/playwright/manifests/sha256:eac9b0a5312cdab40ee8c2429df5bf19bffdccf8f3bf3c42268e173f97541645
- https://github.com/microsoft/playwright/blob/v1.59.1/docs/src/docker.md
- https://github.com/microsoft/playwright/blob/v1.59.1/packages/playwright-core/src/remote/playwrightConnection.ts

## Boundaries

Docker's ordinary bridge supplies a separate browser network namespace and normal outbound access for fonts/assets. No host network, published ports, host IPC, Docker socket, kubeconfig, repository, `.git`, or credentials are mounted. The container uses the runner's non-root UID/GID, drops all capabilities, enables no-new-privileges and has a read-only root filesystem with private `/tmp` and shared memory. No Chromium launch security option or argument changes. Playwright's existing default does not enable `chromiumSandbox`; this change must not be described as enabling it. Workspace gVisor and Kubernetes security/network policies stay unchanged.

Only the exact installed `playwright-core` 1.59.1 package and two server/relay scripts are copied into a dedicated read-only mount. A separate owner-only directory carries Unix sockets. Relays bind exclusively to `127.0.0.1` or those sockets and pipe bytes without inspecting, rewriting or logging HTTP headers, bodies, Host, cookies, URLs or WebSocket frames.

Allowed service ports are 3001 (API), 3020 (preview), 5173 (web), 5174 (admin). Existing synthetic servers use fixed 18083 (network sentinel) and 18084 (wildcard-localhost guard) only while isolation is enabled. Chromium keeps its native localhost/wildcard-localhost resolution. Official `exposeNetwork` supports port filters but forwards wildcard names through host Node DNS; this configuration does not assume equivalence.

Control uses host loopback 18082 → private Unix socket → container loopback 3333. Official `playwright-core run-server` default mode creates independent browsers per connection. Closing one browser must leave the server usable for later clients. A runner-only two-client lifecycle guard checks this. A later guard checks page.request against existing API, preview, web and admin services. Readiness traverses the complete control relay before the startup marker. Official test fixtures consume `PW_TEST_CONNECT_WS_ENDPOINT`; standalone audit/sentinel calls use `chromium.connect` with unchanged launch options. Without the guarded endpoint, local launch behavior is unchanged.

## Bounds and validation

Relay connection counts and connect/idle time are bounded. Idle and the supervisor lifetime backstop are 90 minutes, covering the existing job ceiling without shortening scenario budgets. Setup has command deadlines and its own workflow step limit. Shutdown closes relay sockets with independent bounds. Supervisor PID/starttime is persisted privately with the owner; Linux pidfd pins that instance before validation and signalling. SIGTERM is followed by bounded exit polling; SIGKILL uses that same pidfd only if the instance still exists. Unsupported pidfd fails closed without a numeric-PID signal fallback.

Container removal is only by immutable CID after matching the private owner file and Docker ownership label. The workflow fallback applies the same checks; a name never authorizes deletion. Creation intent is persisted before docker run. A missing CID is benign only when no creation was attempted and absence checks are conclusive. Attempted creation without CID, malformed CID, unreadable state or uncertain Docker fails cleanup explicitly. Docker can confirm that a formerly owned CID is already absent.

The shutdown step is scheduled after successful, failed or cancelled browser startup, including partial startup before readiness. It is skipped when startup itself was skipped, such as an earlier harness failure: no browser resources or ownership environment were created in that case. Startup exports ownership before launching the supervisor. Shutdown still attempts CID cleanup if supervisor stop fails, and either failure fails the step. This preserves the owner/CID/pidfd guards; it does not guarantee cleanup after forced runner termination. GitHub documents the [step outcomes](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context) and [always() cancellation semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#always).

Setup, supervisor stop and container cleanup use separate fixed files: runtime-browser-setup.json, runtime-browser-stop.json and runtime-browser-cleanup.json. Each is limited to 4 KiB of fixed phase/result categories, timestamps and named verification booleans in the existing evidence directory, under the unchanged collector budget. No container output or request bytes are persisted.

All 18 runtime assertions and 81 audit controls, their retries/timeouts, and API → manager → gVisor pod → preview remain unchanged. The sentinel keeps three cycles, its 145-second main deadline, 32 KiB evidence limit and separate fetch/module/Node counters. It is transport evidence, not an application verdict.

Local unit checks validate guards, unchanged launch options, byte-preserving HTTP/WebSocket relay behavior, bounds, ownership and cleanup. They do not prove container viability. After approval, require actual lifecycle/DNS guards, real preflights, sentinel and unchanged suite/audit outcomes before accepting isolation as effective. Never suppress remaining browser errors or assume all functional failures have one cause.
