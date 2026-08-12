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

## Related existing docs
`docs/GCP_DEPLOYMENT.md` (initial provisioning), `docs/GCP_RUNBOOK.md`,
`docs/RELEASE_PROCESS.md`, `docs/infra-deploy-tiers.md` (compute deploy tiers).
This file is the **app-image build+deploy** ground truth those don't spell out.
