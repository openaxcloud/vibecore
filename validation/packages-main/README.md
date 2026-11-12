# Exact main Packages runtime acceptance

This is a focused test harness, not a product change or platform audit. It is
prepared for review only. No workflow was dispatched or published during local
preparation. Production CI for PR899 remains independently mandatory.

## Immutable product and separate harness

- Product SHA: `cd494729e00273d02e2c5a7e79eea1697824f1ca`.
- Product tree: `06d294858b1dc77c5ff72130093bf43fdcf1878c`.
- Proposed validation branch: `test/packages-main-runtime-20261112`, based on that
  product commit. This validation branch must never be merged into main. Only the new workflow and `validation/packages-main/` are added.
- The push trigger matches only that exact branch. No PR, schedule, dispatch,
  production deployment, paid service, provider key or bucket is introduced.
- Product is checked out separately into `product`; harness into `harness`.
  The verifier checks HEAD/tree, Git diff, untracked non-ignored files and the
  actual Git blob hash of every tracked file before and after setup/execution.
- Image context is an unmodified `git archive` of the pinned product commit,
  never the validation branch or the experimental runtime product. Agent uses
  the product Dockerfile unchanged. API/web use the external Proof.Dockerfile:
  it installs from the product lockfile, compiles the API and builds the web.
  The API runs its compiled dist entry with tsx for workspace TypeScript imports.
  Images are local only. They are not published or presented as release images.
- Kubernetes, gVisor and browser/transport files under upstream have exact Git
  blob hashes from e3bdf79 recorded in upstream-provenance.json and verified by
  tests. No experimental API, manager, agent or UI product source is copied.
  Sentinel code is imported only for its environment guard, not executed.

## Topology and security boundary

The existing local CI topology is retained: compiled API in development mode,
web production build, actual main manager/preview services, disposable local
Postgres/Redis/mailpit, isolated browser and real local Kubernetes/gVisor.
Random explicit JWT, cookie, agent, manager and preview secrets are generated.
Auth, ACLs, quotas, resources and rate-limit/MFA defaults are not changed.

This proves the exact product's Packages protocol and behavior in that local
CI topology. It does not prove production HTTPS/CORS deployment configuration.
Main intentionally refuses localhost HTTP in production mode; no guard is
patched, bypassed or disabled to claim that configuration. Development API mode
matches the existing runtime workflow and is explicit in source.json.

The inherited raw browser transport has its existing 90-minute job idle budget;
it is not a product request timeout. The inherited agent router gives only exact
POST /packages/v1/install a330s response timeout. Other route timeouts are
unchanged. The product installation budget remains300s, cumulative API
transport330s, UI observation360s and generic command policy30s.

## Acceptance and artifacts

One disposable user/org/project is created through the normal API. The real UI
is opened, an authenticated capability GET must return version1/max300000/
validatedSpecs1, and missing/invalid bearer requests must fail401/403. The exact
workspace Service selector must select one pod using the built agent tag,
gVisor RuntimeClass and real gVisor dmesg. Pod image IDs are retained.

Before capability validation, bounded read-only GET polling waits for the UI-created
workspace and actual agent startup. No install is sent during this readiness wait.
The browser clicks Install package exactly once for is-odd, waits for the real
POST, reloads, requires the exact visible package row and unchanged workspace,
then invokes the pinned product's import verifier. That helper requires the
persisted succeeded run, exit0, no termination and actually imports is-odd via
Node through the public runtime API in that same workspace. Transport evidence
requires exactly one dedicated install hop with status200. There is no request
mock, POST retry, runtime replay, old-agent fallback or API-local npm install.

Artifacts: source SHA/tree/archive digest, image IDs/revision labels, pinned tool
versions, bounded browser setup/cleanup categories, method/status-only UI calls,
fixed phase failure status, capability numbers, sanitized install result,
transport counters, and cropped installed-package-list screenshot. Raw logs,
request/response bodies, temporary user identities, environment files, tokens
and credentials are never uploaded. Detailed runtime logs remain only in the
private directory on the disposable runner and disappear with it.

Acceptance requires the workflow to succeed, acceptance.passed=true,
importVerified=true, persisted succeeded/exit0/null termination, one install,
and successful cleanup/immutable-source checks. A partial artifact is not a
pass. An install taking less than30s is still functional evidence, but not proof
of a greater-than30s wall-clock install. No slow-package fixture is added here.
Old-agent refusal and budget bounds are covered by pinned product contract tests,
not by substituting an old runtime binary. Do not describe them as live old-agent
coverage. The historical6084/e3bdf79 results are not evidence for this product.

## Cleanup

An EXIT/INT/TERM trap is installed before builds/provisioning/startup. It stops
owned browser resources using the upstream process identity/owner checks,
terminates only process groups created by this harness, removes uniquely named
API/web containers, deletes the dedicated workspaces namespace, removes only
this run's Docker Compose stack/volumes and stops the k3s server tied to the
explicit private kubeconfig. The server is identified by the pinned staged binary
and exact kubeconfig argument; pidfd pins the process during bounded TERM/KILL.
A stop failure makes cleanup fail. A second always() cleanup step covers failed or
cancelled execution. No saved kube context or customer resource is touched.
Remaining runner-local tool files/container-runtime infrastructure are disposed
of with the GitHub-hosted VM. Abrupt SIGKILL/VM loss cannot execute shell traps;
VM disposal is the final isolation boundary. Namespace/compose/browser/source
cleanup failures remain failing verdicts, not warnings or ignored success.

## Commands and current validation limits

Local checks (from repository root):

```
node --test validation/packages-main/invariants.checks.mjs \
  validation/packages-main/diagnostics.checks.mjs \
  validation/packages-main/upstream/runtime-agent-router.checks.mjs \
  validation/packages-main/upstream/runtime-browser-relay.checks.mjs
bash -n validation/packages-main/*.sh
node --check validation/packages-main/acceptance.mjs
node --check validation/packages-main/router.mjs
```

Future reviewed CI execution, performed by the parent via one reviewed branch
push, runs exactly:

```
export PRODUCT_DIR="$GITHUB_WORKSPACE/product"
export HARNESS_DIR="$GITHUB_WORKSPACE/harness/validation/packages-main"
export EVIDENCE_DIR="$GITHUB_WORKSPACE/evidence"
bash "$HARNESS_DIR/run.sh"
```

Current local checks:92 Node checks passed,0 failed,1 skipped; cleanup argument
identity checks and actual owned-subprocess pidfd shutdown passed. The full
repository ESLint preset and Prettier apply to all harness-owned JS files;
upstream blobs remain byte-identical. The real TCP-to-Unix-to-TCP test was
skipped because local Unix socket binding returned EPERM; synthetic relay
checks and real TCP test passed. YAML parsing and shell/JS syntax passed.
The browser-isolation workflow-coupled suite is not transplanted: it references
the old global runtime workflow. No claim is made that it was run for this new
workflow. Its unchanged implementation/provenance and new wiring are reviewed
separately. Docker builds, main API/container startup, real Chromium, cluster
provisioning and the exact-product live scenario are not locally executed.

Before publication, independently review these boundaries, runner permissions
and existing CI capacity. Runtime failures must be investigated, never excused
by the source-level checks or historical experimental-branch proof.

## First real execution and bounded diagnostics

Validation commit c17afa975cb4c9fa6e1616fdd1c76e607d3fce4a tested product
05515deb61d2ff7a77c11243cb0d1bed58a08e69 in run43130887364/job130894434427.
It failed in agent-capability with assertion_failed:3 capability requests,
0 dedicated installs and successful cleanup. The exact failing assertion and
underlying cause are unknown because that artifact contained neither response
statuses nor capability shape. Startup success is not Packages acceptance.
The old genericCommands=0 evidence is invalid for actual POST /commands/run:
the old observer watched /commands, which the product does not use for execution.
The corrected observer counts /commands/run without changing any requests.
Generic commands can legitimately occur during UI workspace startup or the
post-install import helper, so the counter is descriptive, not a zero-command
acceptance criterion. This change does not retroactively validate the old run.

The next execution retains fixed capability substeps, HTTP statuses (at most64
per status array), and fixed field types/boolean matches for version,
maxBudgetMs and validatedSpecs. Additional fields, raw field values, bodies,
headers, tokens, URLs, identities and exception text are never copied into these
diagnostics. Generic JSON requests retain only the last HTTP status. The capability
probe still requires exactly version1/maxBudgetMs300000/validatedSpecs1;
only502/503 retry while the180s deadline has not elapsed between iterations.
This is not a hard180s cutoff: a final fetch10s plus sleep5s can finish later,
followed by two auth probes of up to10s each. Missing/invalid tokens must
receive401/403. The existing global16min acceptance timeout is unchanged. Auth, quotas, routing, install replay policy and runtime
attestation are unchanged. Fixtures in local tests only exercise diagnostics and
negative assertions; they are not substituted for the real runtime probe.

## Manager readiness prerequisite for the fresh workspace

Run43134329124 (validation d9ed633d62a8c8148fab030ce0f5f781e1e5c471,
product cd494729e00273d02e2c5a7e79eea1697824f1ca) reached authenticated
capability status502,502,401 and failed the existing assertion that only502/503
may retry. It made zero installs and all cleanup checks succeeded. The normal
60s token TTL cannot explain the16.094s interval from browser readiness through
cleanup under consistent clocks. No token, signing scheme at mint, or manager
state was persisted in that run, so the precise live authentication cause is not
proven. A deterministic source-level reproduction shows that minting while a
fresh workspace is STARTING without a scheme uses the legacy root secret while
its new pod holds a derived secret. RUNNING commits derived-v1; a newly minted
token then verifies. This is a possible startup race, not a proven live diagnosis
or a product correction. Existing legacy workspaces are a separate case.

For this fresh-workspace Packages test, the harness now authenticates read-only
GETs to the manager and requires the same workspace identity, RUNNING and
derived-v1 before obtaining its agent token once. STARTING alone keeps waiting;
unknown/terminal state, wrong identity/scheme, non-2xx (including401/403), malformed
JSON and deadline expiry remain failures. No lifecycle/start/stop/install request
is added. No401 retry or token regeneration is added. Each fetch/body is capped
at the smaller of20s and the remaining180s total readiness budget; sleeps use the
smaller of5s and the remaining budget, and late successful responses are refused.
The existing16min acceptance-process timeout remains the outer bound.

The readiness artifact records only fixed stages, up to64 HTTP statuses, up to64
fixed state names (unknown values become unknown), and identity/scheme booleans.
It never copies IDs, URLs, bodies, tokens, secrets or arbitrary strings. This
precondition narrows the acceptance scope to Packages on a ready, new derived
workspace; it does not validate user operations during startup or alter manager
behavior for existing legacy workspaces.
