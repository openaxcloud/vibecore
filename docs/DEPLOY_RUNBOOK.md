# Production Deployment — Real Mechanism (Ground Truth)

Reconstructed from the live cluster + repo on 2026-07-07. This is **how prod
(`e-code.ai` / `app.e-code.ai`) actually gets deployed today** — not an
aspirational design.

## TL;DR

- **Trigger:** every push to `main` runs GitHub Actions **`.github/workflows/deploy-main.yml`** (repo `openaxcloud/vibecore` — NOT the `stackblitz-labs/bolt.diy` upstream; `gh` defaults to upstream, so always pass `-R openaxcloud/vibecore`).
- **Build:** it calls **`gcloud builds submit --config=cloudbuild.yaml`** in region **`europe-west9`**, producing 7 images tagged with the commit's **`git rev-parse --short=10`** SHA.
- **Deploy:** **`helm upgrade vibecore infra/helm/platform -n vibecore --reuse-values --atomic --timeout 10m --set services.<tier>.imageTag=<SHA>`**.
- **No GitOps** (no Argo CD / Flux). **Helm release `vibecore`** in namespace `vibecore` on GKE `vibecore-prod-app` (europe-west9).

## Facts (verified live)

| Thing | Value |
|---|---|
| Cluster | GKE `vibecore-prod-app`, region `europe-west9`, project `vibecore-495216` |
| kube context | `connectgateway_vibecore-495216_europe-west9_vibecore-prod-app` |
| Helm release / namespace | `vibecore` / `vibecore` |
| Chart | `infra/helm/platform` (+ `values.yaml`, `values-prod.yaml`) |
| Ingress | ingress-nginx, LB IP `34.1.6.93`; DNS `e-code.ai`/`app.e-code.ai` → `34.1.6.93` directly (no CDN) |
| Registry | `europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/<service>` |
| Image tag convention | `git rev-parse --short=10 <sha>` (e.g. `web:5c2c35865b`); workspace-agent uses `sha-<SHA>` |
| Services rolled every deploy | web + runtime tier (api, workspace-manager, preview-proxy, ai-gateway, worker) |
| Services rolled only on their own change | admin, ai-gateway, worker (separate `single-service` builds); tags otherwise preserved by `--reuse-values` |

## Release gate — a commit only deploys if its own pipeline is green

> **Switching it on for the first time:** follow
> [`RELEASE_GATE_CUTOVER.md`](RELEASE_GATE_CUTOVER.md) — ordered steps, the two
> admin-only prerequisites, and the `Production E2E` decision. This section describes
> the gate once it is live.

**Added 2026-08-12.** Before this, `deploy-main.yml` built and rolled out every push
to `main` with no relationship to that commit's test results. Verified against the
GitHub API, three commits reached production on a red or cancelled pipeline —
`113c17e8` and `9fc8a243` with `Production CI = failure`, `3a53b439` with CI and
Quality `cancelled` — and `Production E2E` had never run on any of them, because
`e2e.yml` did not trigger on push to `main` at all.

The deploy now runs behind a gate:

| Requirement | Where it lives |
|---|---|
| Target is one full 40-hex commit; the image tag is *derived* from it, never supplied | `resolve-target` job |
| Checkout `HEAD` is asserted equal to that commit, in every job that builds or deploys | `resolve-target`, `release-gate`, `preflight-gates`, `build-and-deploy` |
| CI + E2E + Security + Quality all green **for that exact commit** | `release-gate` job → `scripts/release-gate/verify-required-checks.mjs` |
| Refusal happens before any Google credential exists | `id-token: write` is granted to `build-and-deploy` **only** |
| Every service deployed by immutable digest, and the running `imageID`s proven to match | `scripts/release-gate/release-manifest.mjs` |
| Bypass requires a signed last-known-good manifest + two approvals | `.github/workflows/deploy-break-glass.yml` |

**What the gate refuses.** Missing, queued, in-progress at the deadline, skipped,
cancelled, failed, produced by a non-`push` event, produced on a branch other than
`main`, belonging to a different commit, run by a workflow id whose file path no
longer matches, or a run whose pinned required job was deleted or went red. Required
workflows are pinned by **numeric workflow id + file path + job name** in
`scripts/release-gate/required-checks.json` — never by display name, which any commit
can change.

**Wait vs refuse.** CI and the deploy start on the same push, so a check that is
still running is not yet a verdict: the gate polls (default 90 min) and refuses at
the deadline. A check that has already gone red fails the gate immediately.

**Check a commit yourself, without deploying anything:**

```bash
GITHUB_TOKEN="$(gh auth token)" \
  node scripts/release-gate/verify-required-checks.mjs --no-wait \
    --sha "$(git rev-parse origin/main)"
# exit 0 = would deploy, exit 2 = would be refused (prints why, per workflow)
```

**Waivers — how to make a check temporarily not-required, safely.** A pipeline can be
broken for reasons that have nothing to do with release integrity. Making it required
anyway does not gate anything, it blocks everything. So a required workflow may carry:

```jsonc
{ "displayName": "Production E2E",
  "waivedUntil": "2026-08-26",              // hard expiry
  "waiverReason": "suite red for reasons unrelated to release integrity",
  "waiverTicket": "BUG-E2E-001" }           // the work that removes the waiver
```

A waiver is **loud** (printed on every gate run and in the verdict artifact, under
`⚠️ WAIVERS IN EFFECT — this release was NOT fully gated`) and it **expires**: past
the date the check is required again and deploys start refusing. Expiry fails closed
on purpose — this whole gate exists because `Production E2E` was already waived *de
facto*, by never running, with nobody noticing for months. A waiver missing a reason,
a ticket, or with a malformed date is a **refusal**, not a silently ignored field.

**Status as of 2026-08-12: nothing is waived, and the E2E suite is red on every
branch** (0 successes in the last 25 runs). Enabling the gate as written therefore
refuses every deploy until E2E is fixed. Decide deliberately: fix E2E first, or waive
it with a date and a ticket — in which case the gate still enforces CI + Security +
Quality, which alone would have blocked all three commits that shipped red.

**Reproduce the whole digest mechanism locally**, without touching production:

```bash
bash scripts/release-gate/proof-digest-rollout.sh        # ~6 min, needs docker + kind
```
It builds seven *distinct* images (one digest per service, so a cross-service mix-up
would show), pushes them to a throwaway registry, `helm upgrade --install`s **this
chart** with `services.<svc>.imageDigest=…`, asserts every rendered reference is
`@sha256:…`, waits for the rollout, runs the same `verify-imageids` check the deploy
runs — and then tampers with a digest to prove the check can actually fail.

**Consequence to expect:** a red `main` no longer deploys. `Production CI` has been
failing on a large share of recent `main` commits, so until those are fixed, pushes
will be *refused* rather than silently shipped. That is the intended behaviour; the
fix is to get `main` green, not to widen the gate.

## The automatic path (normal case — do nothing)

Push to `main` → `deploy-main.yml` does:

1. Resolve the target commit (`github.sha`, or the `workflow_dispatch` `target_sha`
   input — which must be a full 40-hex commit that is already an ancestor of
   `origin/main`). `SHORT_SHA` is the first 10 chars of it, derived, never supplied.
1b. **Release gate** (see above). Nothing below runs unless it passes.
2. Detect which tiers changed vs the previous SHA (web-only vs full runtime tier).
3. Build (regional Cloud Build):
   ```bash
   gcloud builds submit --config=cloudbuild.yaml \
     --project=vibecore-495216 --region=europe-west9 \
     --substitutions=_SHORT_SHA="${SHORT_SHA}",_DEPS_TAG="${SHORT_SHA}",_VITE_RUNTIME_MODE=remote-kubernetes,_VITE_RUNTIME_API_BASE_URL=https://api.e-code.ai/api/runtime,_VITE_BYOK_DISABLED=true
   ```
   → pushes `…/<service>:${SHORT_SHA}` (+ `:latest`) for the 7 platform images.
4. Resolve **every** service to an immutable digest — the tiers just built, plus the
   ones it didn't build (including `admin`), whose current reference is carried
   forward as a digest. Scan (Trivy, blocking on fixable CRITICALs), generate a
   CycloneDX SBOM, and `cosign verify` — all against the **digest**, so the bytes
   scanned and signed are provably the bytes deployed.
5. Write the **release manifest** (`service → source SHA → Cloud Build id → digest →
   signature → SBOM`). The builder refuses to emit one that isn't a proof: no digest,
   no build id for a rebuilt service, an image built from another commit, or an
   unverified signature all stop the deploy here.
6. Deploy **by digest**:
   ```bash
   helm upgrade vibecore infra/helm/platform \
     --namespace vibecore \
     --reuse-values --atomic --timeout 10m \
     --set platformEnv.runtime.previewUrlTemplate="https://{workspaceId}-{port}.preview.e-code.ai/" \
     --set-string services.web.imageDigest="sha256:…" \
     --set-string services.api.imageDigest="sha256:…" \
     …one per service, taken from the manifest…
   ```
   The chart prefers `imageDigest` over `imageTag` and **fails the render** on a
   malformed digest or an image with neither (`vibecore-platform.imageRef`).
   `imageTag` is still re-asserted alongside, as human-readable provenance only.
7. Verify: `kubectl -n vibecore rollout status deploy/<each> --timeout=5m`, then prove
   the rollout — every running pod of the **current** ReplicaSet must report an
   `imageID` matching its manifest digest. `helm upgrade` succeeding only proves what
   was *asked for*; `imageID` is what the kubelet says it actually ran.
8. Upload the manifest + SBOMs as run artifacts (also on failure).

`--reuse-values` means **a change to `values-prod.yaml` alone never reaches prod** — it must be re-asserted via `--set` (that's why `previewUrlTemplate` is always re-set). A **template** change (e.g. the zero-downtime strategy) *does* take effect on the next upgrade.

## Manual path (what to run by hand — ad-hoc / hotfix / re-deploy a SHA)

You need: `gcloud` (auth'd to `vibecore-495216`), `helm`, `kubectl` context above.

**Option A — re-run the real pipeline (preferred, identical to CI):**
```bash
# FULL 40-hex sha, and it must already be an ancestor of origin/main. The old
# `short_sha` input is gone: it accepted any 7-40 hex string and used it directly as
# the image tag to build and deploy, with no requirement that it corresponded to a
# commit, to main, or to anything that had been tested.
gh workflow run deploy-main.yml -R openaxcloud/vibecore \
  -f target_sha="$(git rev-parse origin/main)"
gh run watch -R openaxcloud/vibecore   # follow it
```
This path is gated exactly like a push: same commit binding, same required checks,
same digest deploy. There is no dispatch input that skips the gate.

**Break-glass (gate down / main red during an incident):** use
`.github/workflows/deploy-break-glass.yml`. It cannot build or ship new code — it only
restores the image digests recorded by a previous **successful, gated** production
deploy, re-verifies every one of those digests against the production cosign KMS key,
and requires **two approvals** via the `production-break-glass` environment.
```bash
gh workflow run deploy-break-glass.yml -R openaxcloud/vibecore \
  -f manifest_run_id=<run id of the last good deploy> \
  -f reason="<why the gated path cannot be used>" \
  -f confirm=BREAK-GLASS
```
One-time setup (repo admin): Settings → Environments → `production-break-glass`, with
**at least two required reviewers** and deployment branches limited to `main`. The
job asserts this via the API and fails closed if it cannot prove it.

**Option B — build + deploy by hand (mirrors the CI steps):**
```bash
SHORT_SHA="$(git rev-parse --short=10 HEAD)"

# 1) build + push images (regional Cloud Build)
gcloud builds submit --config=cloudbuild.yaml \
  --project=vibecore-495216 --region=europe-west9 \
  --substitutions=_SHORT_SHA="${SHORT_SHA}",_DEPS_TAG="${SHORT_SHA}",_VITE_RUNTIME_MODE=remote-kubernetes,_VITE_RUNTIME_API_BASE_URL=https://api.e-code.ai/api/runtime,_VITE_BYOK_DISABLED=true

# (single service only: `make deploy-<svc> SHORT_SHA=${SHORT_SHA}` — build+push only, no deploy)

# 2) deploy (only --set the tiers you rebuilt)
helm upgrade vibecore infra/helm/platform \
  --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app \
  --namespace vibecore --reuse-values --atomic --timeout 10m \
  --set platformEnv.runtime.previewUrlTemplate="https://{workspaceId}-{port}.preview.e-code.ai/" \
  --set services.web.imageTag="${SHORT_SHA}" \
  --set services.api.imageTag="${SHORT_SHA}"
```

**Template-only change (no new images)** — e.g. tweaking the Helm chart:
```bash
helm upgrade vibecore infra/helm/platform \
  --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app \
  --namespace vibecore --reuse-values --atomic --timeout 10m
# --reuse-values keeps the live image tags + secrets (the ai-gateway shared
# secret is preserved via `lookup` + resource-policy: keep). VERIFY with a
# server-side dry-run first: append `--dry-run=server` and diff.
```

## Verify a rollout

```bash
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
kubectl --context $CTX -n vibecore rollout status deploy/vibecore-vibecore-platform-web --timeout=5m
kubectl --context $CTX -n vibecore rollout status deploy/vibecore-vibecore-platform-api --timeout=5m
kubectl --context $CTX -n vibecore get deploy -o jsonpath='{range .items[*]}{.metadata.name}{"  "}{.spec.template.spec.containers[0].image}{"\n"}{end}'
# external health (nginx serves both marketing + app; DNS → 34.1.6.93):
POD=$(kubectl --context $CTX -n ingress-nginx get pods -o name | grep controller | head -1); POD=${POD#pod/}
kubectl --context $CTX -n ingress-nginx exec $POD -- sh -c \
  'for h in e-code.ai app.e-code.ai; do echo "$h -> $(curl -s -k -o /dev/null -w "%{http_code}" -H "Host: $h" https://127.0.0.1:443/)"; done'
```

Recent builds (regional — the default global list misses them):
```bash
gcloud builds list --project vibecore-495216 --region=europe-west9 --limit 10 \
  --format='value(createTime,status,substitutions._SHORT_SHA)'
```

## Rollback

`helm upgrade` runs `--atomic`, so a failed rollout auto-rolls-back. To revert a
*successful* bad deploy:

```bash
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
helm --kube-context $CTX -n vibecore history vibecore          # find the last-good REVISION
helm --kube-context $CTX -n vibecore rollback vibecore <REVISION>
# or per-deployment (faster, image-only):
kubectl --context $CTX -n vibecore rollout undo deployment/vibecore-vibecore-platform-web
```

## Zero-downtime (as of 2026-07-07)

All platform Deployments now set `strategy.rollingUpdate.maxUnavailable: 0` /
`maxSurge: 1`, `minReadySeconds: 10`, `terminationGracePeriodSeconds: 30` and a
`preStop` drain (`infra/helm/platform/templates/deployments.yaml`). A rollout no
longer briefly drops nginx's healthy upstreams. See commit `5c2c3586`.

## Two-phase activation of deployment password protection (P104 / SEC-8)

**Why the deploy is special.** An api build from *before* the P104 cutover
answered a public static deployment with `Cache-Control: public, max-age=60`. A
shared cache may replay that entry for 60 s **with no revalidation**, and the
origin cannot purge what a third-party cache already stored. So if an owner
switched a deployment to `password` inside that window, an anonymous visitor
kept receiving the pre-protection **public** copy: protection real at the
origin, absent at the edge. Post-cutover the origin emits
`public, no-cache, must-revalidate`, so every reuse revalidates through the gate
and the window is closed *permanently* — but only once every pre-cutover pod is
gone **and** its last response has aged out.

`kubectl rollout status` proves neither: it returns as soon as the new ReplicaSet
is complete, while old pods can still be terminating **and still serving**
through their preStop drain.

**The interlock.** `DEPLOYMENT_ACCESS_ACTIVATION_ENABLED` (platform-env
configmap). `0` ⇒ the api refuses to *activate* protection
(`503 DEPLOYMENT_ACCESS_ACTIVATION_DISABLED`); `1` ⇒ activation open. It gates
*activation only*: enforcement of an already-protected deployment never depends
on it, and un-protecting stays allowed at `0`. Chart default is `0` — fail-closed,
so a lost value postpones activation instead of permitting a defeatable one.

**What `deploy-main.yml` does automatically:**

1. **Detect** (`Detect password-activation cutover`) — reads the live flag and
   whether the tree being deployed carries the interlock at all.
   * flag already `1` → steady state, single upgrade, flag re-asserted.
   * flag absent/`0` → **cutover**: run the full sequence below.
   * tree lacks the interlock (rollback to old code) → disarm to `0` + `::warning::`.
2. **Phase 1** — `helm upgrade` with `deploymentAccessActivationEnabled=0`: the
   new code rolls out with activation still closed.
3. **Barrier** (`scripts/deploy-cache-window.mjs`) — polls until **zero** pods
   run anything other than the image the Deployment now wants (terminating pods
   included), then requires **60 s + 30 s margin** of that being *continuously*
   true. The clock arms when the last old pod disappears, and **re-arms from
   zero** if one ever reappears (HPA on the old ReplicaSet, partial rollback).
   Timeout ⇒ the step fails with the release still at `0`.
4. **Phase 2** — second `helm upgrade` setting the flag to `1`, then
   `rollout status`. Both phase-2 steps share the barrier's `if:` guard.
5. **Verify** — reads the flag back from the live configmap and asserts the api
   pod template actually consumes it.

The barrier costs ~90 s **once**, on the cutover deploy only.

### SEC-9 — how "is this tree post-cutover?" is decided

Originally this was `grep -rq DEPLOYMENT_ACCESS_ACTIVATION_ENABLED services/api/src`.
That greps a **directory**, and the directory holds the tests. The token also
lives in `deployment-password.spec.ts`, so deleting the interlock from the
production route while leaving the spec in place still matched — the workflow
concluded "steady state", skipped the drain barrier, and armed activation
against an api with no interlock. **False-positive cutover.**

The replacement is not an exclude list. `scripts/verify-prod-interlock.mjs`
walks the **production module graph** from `services/api/src/server.ts` and only
inspects files genuinely reachable from it — a spec is not reachable, so it
cannot vote, and nothing has to be excluded by name. The graph is cross-checked
against `tsc`'s own emitted file set (identical). It also fails if a test file
*is* reachable from the entrypoint, if the graph is implausibly small (broken
walker), and resolves with exact case so macOS and Linux agree.

`--expect-sha` binds the verdict to the commit being deployed. On
`workflow_dispatch -f short_sha=<other>` the inspected tree is not the deployed
image, so nothing is certified and the flag is disarmed (fail-closed).

Finally, after phase 1 a **runtime probe** asks the *deployed* api to activate
protection and requires a refusal. No static check can prove that about an image
Cloud Build produced elsewhere.

#### What "the interlock is present" actually means (SEC-9 hardening)

The verifier used to accept the **text** `DEPLOYMENT_ACCESS_ACTIVATION_ENABLED`
anywhere in a shipping file. A `// TODO: re-add the … check` left behind by a
revert, or an audit string mentioning it, satisfied that and got certified —
exactly the shape a careless revert leaves. Text is not a control.

It now requires an **executable** guard: the token must be *read from the
environment* (`process.env.X` or `process.env['X']`, the bracket form normalised
first) **and compared** (`===`/`!==`/`==`/`!=`), in code with comments and
string/template literals blanked out. A bare assignment `process.env.X = '1'` —
what a test does to set things up — does **not** certify anything.

The analysis is hermetic (no parser import): `build-and-deploy` checks out the
repo and never runs an install, the same constraint already documented on
`scripts/validate-image-signing-wired.py`.

Counter-tests live in `scripts/verify-prod-interlock.spec.mjs`: a decoy file
carrying the token only in a comment and a string **must fail** the verification,
alongside unit tests for each spelling that is, and is not, a control.

#### Password protection is refused where it cannot be enforced (SEC-11)

The gate exists **only** on `/static-deployments/:id/*`. A `server` deployment is
served from `d-<id>.<previewDomain>`, and vercel/netlify/pages/run/docker from
the provider's own domain — none of those paths read `metadata.access`.

The API used to accept `mode=password` for all of them: it stored a hash and
answered 200, so the product showed the deployment as protected while the URL
stayed world-open. **Phantom protection is worse than refusal**, because the
owner stops looking. `POST /projects/:p/deployments/:d/access` now answers
**409 `DEPLOYMENT_ACCESS_UNSUPPORTED_PROVIDER`** for any non-static provider,
*before* any mutation, so no half-applied state exists. `mode=public` stays
allowed everywhere — de-escalation must never be trapped. Real per-provider
enforcement is separate work.

#### Protection must survive every successor deployment (SEC-12 / 13 / 14)

`metadata.access` has **exactly one writer** — the `/access` route. So any code
path that creates a *successor* deployment from a fresh metadata literal produces
a **public** release while the owner still believes a password is set. That is
the dangerous direction, and it is silent.

The same defect was found on three paths, each having re-derived the rule:

| Path | Was | Now |
|---|---|---|
| publish (`POST /deployments`) | fresh literal → public | inherits (SEC-13) |
| rollback-to-previous (static) | fresh literal → public | inherits (SEC-12) |
| redeploy (`/:id/redeploy`) | spread of the **source** build | inherits current (SEC-14) |
| rollback generic | spread of target; serves nothing (404) | asserted non-leaking (SEC-12b) |
| rollback server · AI `deploy_project` | n/a — not protectable / no artifact | — |

The rule therefore lives once, in `currentSiteAccessConfig(store, projectId,
provider, environment)`:

- **"current"** = newest release of the same project+environment — the owner's
  last expressed intent. It protects when a password is set **and** does not
  resurrect one they removed. Both directions are tested.
- **static only** — the sole provider whose serve path enforces the gate, and
  SEC-11 refuses to set protection anywhere else.
- **sorted explicitly by `createdAt`**, never trusting store order: prisma-store
  lists `desc` while the in-memory test double returned insertion order, so `[0]`
  meant "newest" in production and "oldest" under test. That divergence made a
  wrong implementation look correct; the double now models the real store.

The other axis — an `updateDeployment` wiping `access` on a **live** deployment —
was audited too: `provider` is never mutated (so SEC-11's key is stable) and all
seven metadata writes spread the existing object. No in-place de-protection path
exists.

#### Relation to the release-gate lot (`feat/deploy-exact-sha-gate`)

That lot is the *general* exact-SHA gate for deploys; this one is the *specific*
binding for the activation interlock. They compose, and deliberately overlap:

| | release-gate lot | SEC-9 here |
|---|---|---|
| Pins | `target_sha`, and every job checks out `ref: target_sha` | nothing — it *reads* `SHORT_SHA` |
| Proves | required checks are green **for that exact commit** | the interlock is in the **production bundle** of that commit |
| On mismatch | the run cannot proceed on an unpinned commit | disarms activation, fail-closed |

Their `resolve-target` job derives `short_sha = ${TARGET_SHA:0:10}` into the same
`SHORT_SHA` env this gate already reads, so no rewiring is needed when it lands.
Once it does, the checkout is *provably* the target and this gate's
`sha-mismatch` branch becomes unreachable — kept as a belt, since until then it
is the only thing separating "we inspected tree A" from "we deployed image B".

⚠️ **Both lots restructure `.github/workflows/deploy-main.yml` heavily** (that one
adds ~840 lines, including new jobs above `build-and-deploy`). Whichever merges
second will conflict there and must be re-merged by hand — the step ORDER is the
load-bearing part on this side: `Detect cutover` before the upgrade, and
`runtime probe → barrier → phase 2` strictly after `Verify rollout`.

### Replaying the proof (no cluster needed)

```bash
# Barrier state machine: fake clock, exact timings, re-arm / terminating-pod /
# timeout / empty-read cases.
pnpm vitest --run scripts/deploy-cache-window.spec.mjs

# The workflow's own decision: parses .github/workflows/deploy-main.yml and
# EXECUTES its real `run:` shell against a fake kubectl + fake source tree.
pnpm vitest --run scripts/deploy-activation-sequencing.spec.mjs

# Chart renders the interlock fail-closed (default, values-prod, --reuse-values
# simulation), schema rejects bad values, --set can still arm it. Needs `helm`.
node scripts/validate-helm-access-activation-flag.mjs

# App side: fail-closed activation, enforcement NOT gated by the flag,
# un-protect still allowed, post-cutover cache headers.
pnpm --filter @vibecore/api test -- src/tests/deployment-password.spec.ts

# SEC-9 RED/GREEN: on ONE fixture (token only in a spec), the OLD grep passes
# and the NEW production-graph verifier fails.
pnpm vitest --run scripts/verify-prod-interlock.spec.mjs

# SEC-9 authority check: the walker's graph vs what tsc actually emits.
# Slow (full api build) so it is opt-in, but it is the reason the phrase
# "production bundle" is not just a claim.
SEC9_CROSSCHECK_TSC=1 pnpm vitest --run scripts/verify-prod-interlock.spec.mjs
```

### Replaying the proof ON A REAL CLUSTER

`scripts/sec9-cutover/run.sh` stands a real single-node Kubernetes cluster up
(kind), deploys a stub api in the chart's shape (`maxUnavailable: 0`,
`maxSurge: 1`, `minReadySeconds`, a 10s preStop drain, the flag delivered by
ConfigMap+`envFrom`) and drives the whole cutover, asserting each step:

| # | Step | Assertion |
|---|---|---|
| 0 | baseline | pre-cutover pods really serve `Cache-Control: public, max-age=60` |
| 1 | phase 1 | after rollout the **deployed** api answers **503** to activation |
| 3 | barrier | the real `deploy-cache-window.mjs` waits ≥ 90s after the last old pod vanishes |
| 4 | phase 2 | flag → `1`, activation now returns **200** |
| 5 | negatives | anonymous GET → **401**, `no-store`, zero bytes of protected content |
| 6 | rollback | flag → `0`: activation refused again, **but the already-protected deployment stays gated (401)** and a legitimate unlock still works |

```bash
scripts/sec9-cutover/run.sh          # ~4 min; deletes the cluster on exit
scripts/sec9-cutover/run.sh --keep   # keep the cluster to poke at it
# evidence transcript: /tmp/sec9-cutover-evidence.log (override with SEC9_LOG)
```

Needs `kind` + a running Docker with ~2 GB free. It is deliberately NOT wired
into CI: it is the on-demand, human-replayable proof that the sequence works on
a real control plane, not a substitute for the fast checks above.

The step that only a real control plane can show is #3. `kubectl rollout status`
has already returned by then, yet the barrier observes:

```
barrier: waiting — 2 pre-cutover pod(s) still present (api-db65c8964-845xt [terminating], api-db65c8964-9qrdc [terminating])
barrier: waiting — 1 pre-cutover pod(s) still present (api-db65c8964-845xt [terminating])
barrier: all 2 api pod(s) are post-cutover — starting the 90s quiet period
barrier: CLEARED — 93s elapsed with zero pre-cutover pods; activation is safe
```

Terminating pods still serve through their preStop drain, so "rollout complete"
is not "nothing can still mint a `max-age=60` response". That gap is the whole
reason this barrier exists.

**Run it on a quiet machine.** kind's control plane loses its
leader-election lease if something heavy (a full `tsc`, another test suite) is
competing for CPU; the node then sits `NotReady` with
`cni plugin not initialized`, or cluster creation times out waiting for systemd.

**No registry needed.** The in-cluster probe runs `probe.mjs` inside the stub
image the harness already loads, pinned `IfNotPresent`. An earlier version shelled
out to `curlimages/curl`, which made every probe depend on Docker Hub: on a fresh
node the pull fails, the probe returns an EMPTY string, and an assertion expecting
`401` reports a product failure when nothing was observed. Probes now retry and
exit `PROBE_INCONCLUSIVE` rather than let an empty read become a verdict.

### The cache window against the REAL api (runs in CI)

Everything under `scripts/sec9-cutover/` drives a **stub** api — good enough to
prove the deploy sequence, but it does not prove the real
`/static-deployments/:id/*` route emits headers a shared cache treats safely.
`services/api/src/tests/deployment-cache-window.spec.ts` closes that: the origin
is `buildApiApp()` itself on a real port, with a real shared cache in front, and
it runs on every CI build.

```bash
pnpm --filter @vibecore/api test -- src/tests/deployment-cache-window.spec.ts
```

Two tests, and the first carries as much weight as the second:

1. **CONTROL** — the cache genuinely replays a `max-age=60` entry: after the
   origin starts answering 401, the cache still returns `200` + `x-cache: HIT`
   **without consulting it** (asserted via an origin hit-counter). Without this,
   test 2 could pass simply because the cache never caches anything.
2. **REAL API** — the public response is `no-cache` (and carries no positive
   `max-age`), so activating protection takes effect on the *very next* anonymous
   hit: `401`, not `HIT`, zero bytes of content.

### Observing the cache window itself (the hazard, not the sequence)

The harnesses above prove the deploy *sequence*. `cache-window-demo.sh` proves the
*hazard it exists for*, by putting a real shared cache (`cache-proxy.mjs`,
honouring `max-age` as RFC 9111 permits) between the visitor and the api and
running the actual attack on both code versions:

```bash
scripts/sec9-cutover/cache-window-demo.sh   # ~1 min, Docker only
```

```
A. PRE-CUTOVER code (max-age=60) — the attack
1. anonymous GET (public)    -> 200 | cache-control: public, max-age=60 | x-cache: MISS
2. owner activates password  -> 200                (pre-cutover code has NO interlock)
3. anonymous GET again       -> 200 | x-cache: HIT
>> VULNERABILITY OBSERVED: protected at the origin, still served to an anonymous
   visitor by the shared cache.

B. POST-CUTOVER code (no-cache) — the same attack, closed
1. anonymous GET (public)    -> 200 | cache-control: public, no-cache, must-revalidate
2. owner activates password  -> 200
3. anonymous GET again       -> 401 | x-cache: MISS
>> CLOSED: not reusable without revalidation; the revalidation traverses the gate.
```

Scenario A is asserted to LEAK — if it ever stops reproducing the hazard, the
script fails loudly, because scenario B would otherwise prove nothing.

**If `kind` cannot start on your host** (constrained Docker, systemd boot
detection failing, or no spare CPU to keep a control plane healthy), use the
Docker-backed variant, which asserts the same six steps:

```bash
scripts/sec9-cutover/run-docker.sh
# evidence: /tmp/sec9-cutover-docker-evidence.log
```

Real in both: two genuinely different api builds, real container start/stop with
a real drain delay, real HTTP over a real network, and the **real, unmodified**
`scripts/deploy-cache-window.mjs` making its decisions from real container state
(`fake-kubectl.sh` only reshapes `docker ps` into the JSON `kubectl get pods`
returns — the barrier is not stubbed). What the Docker variant does **not**
exercise is a Kubernetes control plane: rolling-update mechanics, real preStop
hooks and endpoint propagation. Use `run.sh` when you need those too.

### Manual deploys

The two-phase sequence lives in `deploy-main.yml`. If you deploy by hand
(section above), the flag is **not** managed for you: `--reuse-values` keeps
whatever the release stores. To perform a cutover manually, run the phase-1
upgrade with `--set-string platformEnv.runtime.deploymentAccessActivationEnabled=0`,
then `EXPECTED_IMAGE=<api image> node scripts/deploy-cache-window.mjs`, then
repeat the upgrade with `=1`.

## Related existing docs
`docs/GCP_DEPLOYMENT.md` (initial provisioning), `docs/GCP_RUNBOOK.md`,
`docs/RELEASE_PROCESS.md`, `docs/infra-deploy-tiers.md` (compute deploy tiers).
This file is the **app-image build+deploy** ground truth those don't spell out.
