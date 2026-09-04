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

## Related existing docs
`docs/GCP_DEPLOYMENT.md` (initial provisioning), `docs/GCP_RUNBOOK.md`,
`docs/RELEASE_PROCESS.md`, `docs/infra-deploy-tiers.md` (compute deploy tiers).
This file is the **app-image build+deploy** ground truth those don't spell out.
