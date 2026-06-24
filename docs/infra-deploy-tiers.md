# Compute Deployment Tiers — Infrastructure Requirements

This document lists exactly what must be provisioned to **activate** the three
compute deployment tiers (Autoscale / Reserved VM / Scheduled) in the E-Code
Publish panel. Today the managed deploy backend is **static-only**: `provider=static`
runs an in-process build and serves the result at
`https://api.e-code.ai/static-deployments/<id>/`. The compute tiers exist in the UI
(type selector + config scaffolding) and as billing rates
(`services/api/src/metering-service.ts`) but have **no provisioning runtime** — the
UI marks them "coming soon" and never fakes a deployment.

Legend: **[code]** = implementable in this repo without new infra · **[infra]** =
requires cluster/GCP provisioning by the operator (Avi).

---

## 0. Shared foundation (needed by all three tiers)

A managed compute deploy means running **user code as a workload on our infra**,
which static hosting does not. The pieces shared by every tier:

### [infra] Build executor + container registry
- A build service that turns a workspace snapshot into a runnable artifact
  (container image). Options:
  - **Google Cloud Build** triggers, or
  - **Kaniko**/**Buildpacks** running as in-cluster Jobs.
- An **Artifact Registry** repo to hold built images.
  ```bash
  gcloud artifacts repositories create ecode-deploys \
    --repository-format=docker --location=us-central1 \
    --description="User app images for managed deploys"
  ```
- Workload Identity / IAM so the build SA can push images and the runtime SA can pull.
  ```bash
  gcloud iam service-accounts create ecode-deploy-builder
  gcloud projects add-iam-policy-binding <PROJECT> \
    --member="serviceAccount:ecode-deploy-builder@<PROJECT>.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"
  ```

### [code] Async build pipeline (job queue)
- Today the static build runs **synchronously inside the deploy POST** (≤600s). A
  compute build is longer and must be a background job. Add a queue + worker
  (reuse the existing `services/worker` + Redis) so the deploy POST returns a
  `QUEUED` Deployment row immediately and a worker drives `QUEUED → BUILDING →
  DEPLOYING → READY/FAILED`.

### [infra] Host-based ingress + wildcard TLS
- Static deploys are **path-based** on `api.e-code.ai`. A running service needs its
  own origin, e.g. `https://<deployment>.apps.e-code.ai`.
  - Cloud DNS wildcard record: `*.apps.e-code.ai → ingress IP`.
  - Wildcard/managed cert for `*.apps.e-code.ai` (Google-managed cert or cert-manager).
  - Ingress (or Gateway API) rule routing the subdomain to the deployment Service.

### [code] Deployment provider + lifecycle wiring
- Extend `deploymentProviders` + `buildDeploymentUrl` (services/api/src/deployments.ts)
  for the compute providers, add provisioning/status/logs routes, and replace the
  disabled lifecycle controls in `ComputeTierPreview` with real start/stop/restart
  actions once the runtime exists.

---

## 1. Autoscale (scale-to-zero HTTP service)

Mirrors Replit Autoscale: an HTTP service that scales up under load and to zero when idle.

| Item | Type | Detail |
|---|---|---|
| Serverless container runtime | **[infra]** | **Google Cloud Run** (simplest, native scale-to-zero) or in-cluster **Knative Serving** on GKE |
| Cloud Run service per deployment | **[infra]** | `gcloud run deploy <id> --image=<registry>/<id> --min-instances=0 --max-instances=N --region=us-central1 --no-allow-unauthenticated` + IAM invoker for the proxy |
| Request routing | **[infra]** | Map `<id>.apps.e-code.ai` → Cloud Run URL (Cloud Run domain mapping, or proxy through preview-proxy) |
| Concurrency/scale config | **[code]** | min/max instances are already collected in the Autoscale config UI; pass them to the provisioner |
| Per-request metering | **[code]** | `autoscaleUsageCents` already exists in metering-service.ts — wire it to real request counts |

**Minimal path:** Cloud Run + Artifact Registry + domain mapping. No GKE node-pool
changes required if using Cloud Run (recommended first tier to enable).

---

## 2. Reserved VM (always-on dedicated instance)

Mirrors Replit Reserved VM: a dedicated, always-on instance — no cold start.

| Item | Type | Detail |
|---|---|---|
| Dedicated compute | **[infra]** | A GKE **node pool** (or per-deployment GCE VM). Example node pool: |
| | | `gcloud container node-pools create reserved-vms --cluster=<cluster> --machine-type=e2-standard-2 --num-nodes=1 --node-labels=ecode-tier=reserved --node-taints=ecode-tier=reserved:NoSchedule` |
| Always-on Deployment/StatefulSet | **[infra]** | `replicas: 1`, `minReplicas==maxReplicas`, nodeSelector `ecode-tier=reserved`, toleration for the taint |
| Persistent storage | **[infra]** | A `PersistentVolumeClaim` per reserved deployment (the static tier is ephemeral) |
| Host routing + TLS | **[infra]** | Same `*.apps.e-code.ai` wildcard ingress as Autoscale |
| Machine-size selection | **[code]** | the Reserved VM config UI already offers sizes; map each to CPU/RAM resource requests + machine type |
| Reserved-tier metering | **[code]** | `reservedVmCents` / `ReservedVmTier` already in metering-service.ts |

**Cost note:** always-on means continuous spend per deployment — gate behind a paid
plan + explicit confirmation before provisioning.

---

## 3. Scheduled (cron jobs)

Mirrors Replit Scheduled: run a command on a recurring schedule.

| Item | Type | Detail |
|---|---|---|
| Cron scheduler | **[infra]** | Kubernetes **CronJob** per scheduled deployment (no extra infra beyond the build executor): |
| | | `kubectl create cronjob <id> --image=<registry>/<id> --schedule="<cron>" -- <command>` |
| Cron validation | **[code]** | **DONE** — `app/components/deploy/cron-expression.ts` validates the 5-field expression client-side |
| Run trigger + history | **[code]** | a route to create/patch the CronJob + a route reading `Job` run history (k8s API via packages/k8s-client) |
| Manual "run now" | **[code]** | create a one-off `Job` from the CronJob template |
| Scheduled metering | **[code]** | metering kind `scheduled` already priced in metering-service.ts |

**Minimal path:** the cheapest tier to enable — needs only the build executor (§0)
+ CronJob creation through the existing k8s-client. No ingress/TLS (jobs have no HTTP endpoint).

---

## Recommended enablement order

1. **Scheduled** — lowest infra (build executor + CronJob); no ingress/TLS.
2. **Autoscale** — Cloud Run + Artifact Registry + wildcard DNS/TLS; no node-pool change.
3. **Reserved VM** — dedicated node pool + persistent storage + always-on cost controls.

Each tier's **[code]** work (routes, provisioner wiring, lifecycle controls) is ready
to implement in this repo as soon as the corresponding **[infra]** is provisioned;
the UI scaffolding and cron validation already exist.
