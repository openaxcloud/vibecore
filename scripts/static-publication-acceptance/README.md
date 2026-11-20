# Opt-in static publication acceptance (CANDIDATE NOT RUN)

Product: `aaaf642064b5eeefc8975ccff9b151ff0beb1ec4`, tree
`ce6cf86fa809479accb22d0aefb206903a5f584d`. QA-only overlay and dedicated one-shot workflow; no application or existing workflow changes.

## Status and honest scope

The preceding run 44727296537 reached an exact editor, verified focus and full selection,
then stopped before saving with an unexpected model. The pinned Monaco control reproduces
the mechanism: a keyboard "<" surrounds selected text in both HTML and the core plaintext fallback.
This candidate replaces only the unique ASCII marker through native keyboard input; it
still checks exact full HTML, model/dirty/renders, a true save receipt and two anonymous versions.
This candidate has not run in a browser. Source attestation and unit tests do not establish
publication, a real pod build, persistence, Playwright selectors, or website readiness.

`publication.pw.ts` uses real browser requests, not fulfilled responses or inserted deployment
rows. It edits index.html in Monaco, holds the actual PUT, clicks the actual publication UI,
requires no deployment POST before a real 204/manifest receipt, checks the explicit workspace,
then checks the actual returned URL from a fresh anonymous browser context. It repeats this
with the actual Republier control and a second unique marker. Success requires both markers.
Fresh publishing is consumed once by the real `triggerDeployBuild` helper; static republishing
uses its existing synchronous pod-build route. The consumer never calls redeploy.

This tests the desktop static path only. It does not establish mobile, server-app publication,
ZIP import, or immutable revision isolation against simultaneous external edits.

## Smallest supported stack and remaining integration

Use the existing `scripts/private-runtime-recipe` disposable kind stack on one ordinary free
Linux runner, with the product checkout and platform image built from the exact SHA above.
The ordinary mocked E2E API cannot establish real pod/artifact provenance. Do not bolt this
onto the failing ZIP journey, reuse its fixture, or run a second cloud/provider stack.

The opt-in hook is now implemented in `scripts/private-runtime-recipe/run.ts`. It runs at
ready-stack time and returns through the existing finally/cleanup; the normal recipe path
is unchanged when VC_STATIC_ACCEPTANCE is absent. The isolated proposed ref is
`refs/heads/codex/qa-static-marker-edit-20261120` (candidate has not been published). `push` on that exact ref plus VC_STATIC_ACCEPTANCE=1 and E2E_PROVIDER_MODE=absent are mandatory.
Use the exact product in a separate checkout with this QA overlay; the hook verifies product
HEAD and clean tracked product files before allocating. The dedicated workflow is dormant in this local candidate.

The hook starts web with an allowlisted environment, Redis forward, one seed, one gateway,
one consumer and Chromium, then checks their terminal results. It does not start a preview
proxy or supply preview-tenant secrets. Preview may be unavailable in the IDE; that is not
part of this acceptance. If this degradation prevents the real editor/save/publication flow,
the run fails rather than bypassing UI or inventing a website. No second fixture or retry.

Only these resource/environment changes are needed on the *owned local API deployment*:

- `STATIC_DEPLOY_STORAGE_DIR=/data/projects/.qa-static-artifacts` (existing project PVC).
- `STATIC_DEPLOY_BASE_URL=http://127.0.0.1:4317` (owned browser gateway).
- Port-forward owned `service/redis` to 127.0.0.1:56379, alongside owned API :3001 and web :5173.

No service-account, Role/RoleBinding, security context, network permission, account permission,
production setting, app-deploy/server infrastructure, or new volume is requested. If existing
permissions are insufficient, stop. Do not enable a fallback builder to manufacture a pass.
The platform image must be built once from the exact product, not reused from old ZIP QA.

## Ready-stack sequence (implemented by the opt-in hook)

1. Retain the existing recipe's generated name (`vc-private-` + 16 hex digits), explicit
   KUBECONFIG/context, generated local shared secret, process handles, volume ownership, and
   image provenance. Refuse occupied ports and unknown existing servers/tunnels. Keep its
   overall job cap unchanged; this subset has a 20-minute browser/gateway bound and no retries.
2. Set the two API environment values above *in the recipe's generated resources before
   startup*, wait for health using the existing readiness check. Do not print manifests or
   secrets. Keep the current namespace and manager RBAC unchanged.
3. Start the web server using the existing local-stack web setup pointed only at API :3001.
   Start the owned Redis forward; do not run the full worker process (other workers/crons are
   out of scope). Verify the queue is fresh. The dedicated consumer refuses nonempty queues.
4. In a private 0700 directory, use an initially absent `fixture.json`. Run commands with an
   explicit allowlisted environment (not an inherited production shell). Required variables:

   ```text
   VC_STATIC_ACCEPTANCE=1
   E2E_PROVIDER_MODE=absent
   VC_STATIC_API=http://127.0.0.1:3001
   VC_STATIC_WEB=http://127.0.0.1:4317
   VC_STATIC_UPSTREAM_WEB=http://127.0.0.1:5173
   VC_STATIC_RECIPE_ID=<owned generated recipe name>
   VC_STATIC_FIXTURE=<private directory>/fixture.json
   VC_STATIC_PRIVATE_RESULTS=<private directory>/playwright-results
   REDIS_URL=redis://127.0.0.1:56379
   KUBECONFIG=<owned explicit config>
   INTERNAL_API_SHARED_SECRET=<same generated local manager secret, never print>
   ```

   The hook generates the private path and supplies these values; do not inject a user token.
   Also allow only required local PATH/HOME/temp/Playwright cache variables. No provider keys,
   deploy hooks, production credentials, analytics/email/billing configuration. `ownedRecipe`
   verifies loopback Kubernetes server, exact context/namespace ownership, expected platform
   image name and API environment. The owned recipe builds and loads the platform image from its checked exact product checkout;
   record the image content identity in the runner attestation, not merely its tag.
5. The following are the child commands the hook coordinates. Do not start a second copy
   manually alongside the hook. They require the exact clean product checkout and frozen dependencies:

   ```sh
   timeout 240s node scripts/static-publication-acceptance/seed.mjs
   # Start and retain PIDs; wait for their fixed ready/waiting statuses before browser:
   timeout 1200s node scripts/static-publication-acceptance/gateway.mjs --serve
   timeout 900s node --import tsx scripts/static-publication-acceptance/consumer.mjs
   # The previous two commands run concurrently under the ready-stack owner's lifecycle.
   timeout 1200s node_modules/.bin/playwright test \
     --config scripts/static-publication-acceptance/playwright.config.ts
   ```

   Seed uses supported signup/project/workspace APIs, then real runtime file writes. It saves
   private cleanup identity before starting runtime allocation. Its dependency-free package
   and lockfile use the unchanged production npm-install flags; no .npmrc override is added.
   A failed seed is terminal, not grounds to silently start another fixture.
6. Require browser exit 0 AND `anonymous-static-versions / verified / versions:2`, plus the
   one fresh worker completion. Queue acceptance/HTTP 202/READY alone is never sufficient.
   Any selector failure, missing runtime, missing receipt, wrong workspace, build refusal,
   external navigation, stale source, or absent marker is NOT VERIFIED. No retry in this run.
7. Always terminate only owned children and use the existing recipe finalizer to remove its
   cluster/volumes. Delete private fixture cookie/token and results. Never upload raw logs,
   screenshots, traces, bodies, source files, or credentials. The supplied reporter prints
   status only; retaining private local error investigation requires a separate explicit step.

## Local runnable controls (not end-to-end)

```sh
node --import tsx --test scripts/static-publication-acceptance/*.node-test.mjs
node_modules/.bin/tsc -p scripts/static-publication-acceptance/tsconfig.json
for f in scripts/static-publication-acceptance/*.mjs; do node --check "$f"; done
```

The hook resource test verifies that only the two named API environment values change and
all RBAC, credentials, volumes and other resources remain byte-equivalent.

These controls do not start a cluster, seed an account, invoke a provider, or run a browser.

The opt-in hook is source/type/contract tested only, not live-executed. No publication result is claimed.

## One-shot launch candidate (local only)

The only eligible event is the first non-created, non-forced, non-deleted push whose before SHA
is aaaf642064b5eeefc8975ccff9b151ff0beb1ec4 on the exact proposed branch. Branch creation,
workflow_dispatch, rerun attempts, private/fork repositories, other refs and other parents
are rejected. Workflow has no dispatch trigger. It uses public standard ubuntu-24.04, read-only
contents, 90-minute hard cap, and no artifact upload. No other workflow is modified.

The workflow checks out QA at github.workflow_sha and product at aaaf642 separately. Before
allocation, source attestation requires the exact single parent, exact changed paths (including
the workflow itself), exact committed overlay bytes and manifest, detached product HEAD and
no non-QA product changes. The recipe repeats this attestation before execution/cleanup.
All eight Node controls, original recipe tests and both scoped typechecks run before allocation.
Frozen dependencies and pinned kind/kubectl/Chromium installation are the existing official
client prerequisites, not application-provider or production calls.

The safe-run wrapper drops child stdout/stderr, forwarding only fixed completed/failed verdicts.
The final verified verdict requires BOTH the real browser two-version assertion AND exit 0
after the owned recipe's cleanup. A printed marker with a nonzero exit cannot pass. No raw
Playwright logs, cookies, source snippets, URLs, screenshots or traces are uploaded.

Local dual checkout verifies source/overlay and controls, not Docker/Chromium startup. Live
204 save/POST ordering and anonymous v1/v2 website acceptance remain NOT VERIFIED.

## Confirmed correction after failed first acceptance

Official b82c5b7 tree matches prior saved QA. Run44274280302 failed after about565seconds;
cleanup succeeded, but old wrapper suppressed the failing stage. Exact runtime cause UNKNOWN.
The step included image builds and stack startup, so duration does not prove browser timeout.

Independently reproduced harness defect: legacy buildCommand form selector cannot select the
actual managed publication form. The corrected test selects form.vc-managed-publish-form, uses
its static override, and leaves absent build/output fields to existing web/API defaults. A real
DeployPublishCard render + schema/worker-guard contract verifies this. Desktop Monaco unchanged.

Enum diagnostics now relay recipe/hook/seed/browser phases and reviewed failure categories only.
No arbitrary error text, identifiers, URLs, command output or extra JSON properties are accepted.
Lines over512characters are discarded; each receiver emits at most128 events.
Before/after known failure test proves old loss and new multi-hop visibility without private output.
The final two-version proof and nonzero-exit rejection remain unchanged.

This new ref is independent, with sole launch parent aaaf642; old run/branch is not rearmed.
Fresh dual-checkout preflight requires 10 Node controls, 9 Vitest tests and both scoped typechecks.
No browser startup/live publication is claimed from local tests.

## Combined compiled acceptance candidate (dormant)
Historical discovery iteration (not this launch): sole exact product aaaf parent, dedicated ref codex/qa-static-publication-discovery-20261118. No external action. One owned stack and one official compiled webbuild, first genuine expected IDE document/indexrow/Monaco checkpoint (editor-v1 complete), then original true Publish and Republish save204manifest→POST guards and two clean anonymousversions. Editor-v2 complete emitted before second edit. No separate bootstrap cluster/build.

Owned child processgroups include pnpm grandchildren. Stop clears each timer immediately, SIGTERM thenSIGKILL with at most500ms drain, destroys inheritedstdout and waits for all ownedgroups concurrently. Hook signal cancellation stops groups before cleanup and refuses newchildren. Original leak reproduced with tiny real parent/grandchild test. No stale web-ready timers after cleanup.

The diagnostic probe's POST policy blocked real adapter /api/runtime/runtime/boot, a no-op APIhandshake. This combined fullpublication driver retains its prior same-origin HTTP/WS policy and already permits boot/start/list/assets; gateway control proves those routes forward. Prior restrictive policy retained ONLY as testfixture. No new product change is asserted. Original fullpublication editor-v1 cause is still unproved; this candidate discriminates it with actual editor proof before any publication, without a duplicate run.

Production build/start and provider-free runtimeenv match compiledbootstrap. Build20min; anonymous /login asset preflight120s is transport-only, not authenticated IDE proof. Entire job remains90min standardUbuntu24.04 with Node22, onepush-only, no retries/providers/RBAC/cloud/publicartifacts. Actual build/browser notrun locally. All first-push/path/overlay/cleanup guards retained.

## Session single-fetch transport correction
This QA-only delta permits exactly three canonical encoded GET requests generated by the actual product React Router: root impersonation status, owned-project deployment detection for the exact workspace, and owned-project rate card. Other encoded queries/pathnames, non-GET methods, wrong ownership and mixed parameters remain rejected. Actual component + actual React Router single-fetch + actual resource loader loopback controls prove the previous 403 displaced the root and the narrow transport preserves it. Sentinel IDE children in those controls are NOT a real browser acceptance. Full acceptance still requires both real editor changes, held save requests with 204 manifest acknowledgement before each actual publication POST, and independent anonymous marker v1/v2 reads. No local compiled browser result is claimed. On actual root route error the editor wait now reports a fixed route-error enum; no raw text is emitted.

## Production lazy discovery repair (local proof, not browser release proof)
React Router SSR defaults to lazy route discovery. The previous control registered all client routes, omitting /__manifest before the session fetcher. The new control uses the actual discovery function, actual root Banner and loader, actual HTTP handler and partial client manifest. Frozen previous gateway403 removes the child before any .data request; direct and repaired paths succeed. A real Link/eager-discovery hook control also proves the owned IDE/deployment/canonical-alias batch. Sentinel child UI is not the compiled IDE.
GET /__manifest accepts only bounded canonical query parameters paths+version, compiled8hex version, reviewed root navigation paths and exact fixture project/alias ancestors. It permits parameter/path-list order and version variation; rejects unrelated routes, other projects, path escapes, duplicate keys and mutations. Alias comes from existing supported creation responses, never from arbitrary browser input. Default official web upstream and runtime/static overrides remain unchanged. No extra API requests.
The tiny closed framework-transport events show discovery/session-data/deployment-data phase and started, status family, version-mismatch or network-failed only. No URLs, IDs, body, text or error strings. Manifest204 with X-Remix-Reload-Document:true is a version mismatch, not successful discovery; actual Router reloads the document and reports an error without applying patches if the same mismatch repeats. Generic discovery Error maps to product RootErrorView500, so a rendered500 must not be mislabeled an HTTP403. Tests verify actual server204 header contract; no forced mismatch browser navigation is claimed.
Inventory: root Banner session lookup; IDE topbar /dashboard, /projects, support/account settings, exact project IDE and canonical /@organization/project links; DeployPublishCard detection/ratecard targets exact owned deployments route. Export is a plain download anchor; Publish/Republish POST is ordinary fetch, not Router mutation. Provider/API guards and static anonymous protections are unchanged.
