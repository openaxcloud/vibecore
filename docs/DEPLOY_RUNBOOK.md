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

## The automatic path (normal case — do nothing)

Push to `main` → `deploy-main.yml` does:

1. `SHORT_SHA="$(git rev-parse --short=10 HEAD)"` (or the `workflow_dispatch` `short_sha` input).
2. Detect which tiers changed vs the previous SHA (web-only vs full runtime tier).
3. Build (regional Cloud Build):
   ```bash
   gcloud builds submit --config=cloudbuild.yaml \
     --project=vibecore-495216 --region=europe-west9 \
     --substitutions=_SHORT_SHA="${SHORT_SHA}",_DEPS_TAG="${SHORT_SHA}",_VITE_RUNTIME_MODE=remote-kubernetes,_VITE_RUNTIME_API_BASE_URL=https://api.e-code.ai/api/runtime,_VITE_BYOK_DISABLED=true
   ```
   → pushes `…/<service>:${SHORT_SHA}` (+ `:latest`) for the 7 platform images.
4. Deploy:
   ```bash
   helm upgrade vibecore infra/helm/platform \
     --namespace vibecore \
     --reuse-values --atomic --timeout 10m \
     --set platformEnv.runtime.previewUrlTemplate="https://{workspaceId}-{port}.preview.e-code.ai/" \
     --set services.web.imageTag="${SHORT_SHA}" \
     --set services.api.imageTag="${SHORT_SHA}" \
     --set services.workspaceManager.imageTag="${SHORT_SHA}" \
     --set services.previewProxy.imageTag="${SHORT_SHA}" \
     --set services.aiGateway.imageTag="${SHORT_SHA}" \
     --set services.worker.imageTag="${SHORT_SHA}"
   # (only the --set lines for tiers actually rebuilt this run are included;
   #  skipped tiers keep their live tag via --reuse-values)
   ```
5. Verify: `kubectl -n vibecore rollout status deploy/<each> --timeout=5m`.

`--reuse-values` means **a change to `values-prod.yaml` alone never reaches prod** — it must be re-asserted via `--set` (that's why `previewUrlTemplate` is always re-set). A **template** change (e.g. the zero-downtime strategy) *does* take effect on the next upgrade.

## Manual path (what to run by hand — ad-hoc / hotfix / re-deploy a SHA)

You need: `gcloud` (auth'd to `vibecore-495216`), `helm`, `kubectl` context above.

**Option A — re-run the real pipeline (preferred, identical to CI):**
```bash
gh workflow run deploy-main.yml -R openaxcloud/vibecore \
  -f short_sha="$(git rev-parse --short=10 origin/main)"
gh run watch -R openaxcloud/vibecore   # follow it
```

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
