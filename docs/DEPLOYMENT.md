# Production deployment runbook

End-to-end production deploy on GKE `vibecore-prod-app` in
`europe-west9` (project `vibecore-495216`). Assumes you already have
the GCP coordinates from `project_prod_infra_coords` memory and the
secrets bootstrap is done per [`PROD-SECRETS-BOOTSTRAP.md`](./PROD-SECRETS-BOOTSTRAP.md).

Rollback procedure lives in [`ROLLBACK.md`](./ROLLBACK.md). On-call
specifics live in [`RUNBOOK.md`](./RUNBOOK.md).

---

## What's deployable today

The current main has the launch stack wired:

| Layer | Status |
|-------|--------|
| Managed-mode AI billing (cost ledger + quota + force-keys) | ✅ C1.b |
| HA: web/admin/api/ai-gateway/preview-proxy/workspace-manager at replicas:2 | ✅ Phase 0 A8 + B4 |
| Workspace auto-GC (every 15 min) | ✅ B6.2 |
| SIEM webhook delivery (every 5 min) | ✅ B6 |
| Data retention enforcement (daily 03:30 UTC) | ✅ B6 |
| Liveness `/health` + readiness `/ready` separated (api) | ✅ |
| SHA-pinned image tags rejected at deploy time if `:latest` | ✅ A7 |
| Production secret guards (`dev-*` fallbacks refuse to boot prod) | ✅ B3 |
| `i18next` runtime wired in the Remix shell | ✅ parallel |
| AST self-repair retry loop on agent file writes | ✅ parallel |

---

## Pre-flight (do once per deploy session)

```bash
# 0. From the repo root, on a clean main:
git fetch origin
git checkout main
git reset --hard origin/main
git rev-parse --short HEAD  # remember this SHA for step 4

# 1. Refresh cluster credentials.
gcloud auth login
gcloud config set project vibecore-495216
gcloud container clusters get-credentials vibecore-prod-app \
  --region europe-west9 --project vibecore-495216

# 2. Add your current public IP to the master authorized network so
#    kubectl + helm can reach the control plane. The IP rotates with
#    your ISP, so this is a per-session step.
MY_IP=$(curl -s ifconfig.me)
gcloud container clusters update vibecore-prod-app \
  --region europe-west9 --project vibecore-495216 \
  --enable-master-authorized-networks \
  --master-authorized-networks "${MY_IP}/32"

# 3. Confirm cluster reachability + Helm release state.
kubectl get nodes
helm history vibecore -n vibecore
```

---

## Step 1 — Build immutable images

The Helm chart refuses `:latest` (sentinel `REQUIRED_OVERRIDE_AT_DEPLOY`
in `values-prod.yaml`), so every deploy needs an SHA-tagged build of
all 8 services.

Two equivalent paths:

### Path A — GitHub Actions (preferred for production)

```bash
# Push main to the build branch — .github/workflows/docker.yml will
# fan out builds for web/admin/api/worker/ai-gateway/workspace-manager/
# workspace-agent/preview-proxy in parallel, tag them sha-<short>, run
# SBOM + Trivy + push to Artifact Registry.
git push origin main:product/saas-platform-production

# Wait ~10 min, then verify:
SHA=$(git rev-parse --short HEAD)
for img in web admin api worker ai-gateway workspace-manager preview-proxy workspace-agent; do
  gcloud artifacts docker images describe \
    europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/${img}:sha-${SHA} \
    --project=vibecore-495216 --format="value(uri)" >/dev/null 2>&1 \
    && echo "ok    ${img}:sha-${SHA}" \
    || echo "MISSING ${img}:sha-${SHA}"
done
```

### Path B — Local Cloud Build (emergency / GHA outage)

```bash
SHA=$(git rev-parse --short HEAD)
gcloud builds submit \
  --project=vibecore-495216 \
  --region=europe-west9 \
  --tag=europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/web:sha-${SHA} \
  --machine-type=e2-highcpu-32 \
  --timeout=1200s \
  .
# Repeat for each service — much slower; prefer Path A.
```

---

## Step 2 — Sync the K8s Secret from GCP Secret Manager

19 of the 20 production secrets are populated in Secret Manager. The
20th (`vibecore-prod-anthropic-api-key`) is optional — managed mode
falls back to OpenAI / Gemini / etc. when missing.

```bash
SHA=$(git rev-parse --short HEAD)

# Pull every prod secret into a transient env file (chmod 600).
TMP=$(mktemp -t vibecore-secrets.XXXXXX)
chmod 600 "$TMP"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT INT TERM

# Map of K8s env var name → GCP Secret Manager secret name.
declare -A MAP=(
  [DATABASE_URL]=vibecore-prod-database-url
  [REDIS_URL]=vibecore-prod-redis-url
  [JWT_SECRET]=vibecore-prod-jwt-secret
  [COOKIE_SECRET]=vibecore-prod-cookie-secret
  [CONFIG_ENCRYPTION_KEY]=vibecore-prod-encryption-key
  [WORKSPACE_AGENT_TOKEN_SECRET]=vibecore-prod-workspace-agent-token-secret
  [BACKUP_ENCRYPTION_KEY]=vibecore-prod-backup-encryption-key
  [SIEM_SIGNING_SECRET]=vibecore-prod-siem-signing-secret
  [GOOGLE_CLIENT_ID]=vibecore-prod-google-client-id
  [GOOGLE_CLIENT_SECRET]=vibecore-prod-google-client-secret
  [GITHUB_CLIENT_ID]=vibecore-prod-github-client-id
  [GITHUB_CLIENT_SECRET]=vibecore-prod-github-client-secret
  [OPENAI_API_KEY]=vibecore-prod-openai-api-key
  [ANTHROPIC_API_KEY]=vibecore-prod-anthropic-api-key
  [GOOGLE_GEMINI_API_KEY]=vibecore-prod-google-gemini-api-key
  [XAI_API_KEY]=vibecore-prod-xai-api-key
  [MOONSHOT_API_KEY]=vibecore-prod-moonshot-api-key
  [STRIPE_SECRET_KEY]=vibecore-prod-stripe-secret-key
  [STRIPE_WEBHOOK_SECRET]=vibecore-prod-stripe-webhook-secret
  # Svix-format signing secret from the Resend dashboard. Required by
  # /webhooks/resend (services/api/src/app.ts:5217) — the route returns
  # 503 WEBHOOK_NOT_CONFIGURED until this is populated.
  [RESEND_WEBHOOK_SECRET]=vibecore-prod-resend-webhook-secret
  [SENTRY_DSN]=vibecore-prod-sentry-dsn
)
for k in "${!MAP[@]}"; do
  v=$(gcloud secrets versions access latest --secret="${MAP[$k]}" --project=vibecore-495216 2>/dev/null) || continue
  printf '%s=%s\n' "$k" "$v" >> "$TMP"
done

# Static config (not secret, but lives in the same K8s Secret so every
# Deployment sees it via envFrom).
cat >> "$TMP" <<'EOF'
NODE_ENV=production
APP_ENV=production
VITE_RUNTIME_MODE=remote-kubernetes
VITE_RUNTIME_API_BASE_URL=https://workspace-manager.e-code.ai
WORKSPACE_MANAGER_URL=https://workspace-manager.e-code.ai
WORKSPACE_RUNTIME_NAMESPACE=workspaces
LOG_REDACTION_ENABLED=true
OTEL_SERVICE_NAME=vibecore-platform
EOF

# Apply the Secret server-side merge so existing fields not in our map
# (set out-of-band, e.g. SMTP creds) survive.
kubectl create namespace vibecore --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic vibecore-platform-secrets \
  --namespace=vibecore \
  --from-env-file="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f -

# Shred the temp file even if the trap didn't fire.
shred -u "$TMP" 2>/dev/null || rm -f "$TMP"
```

---

## Step 3 — Helm upgrade with the SHA pin

Prisma migrations run automatically as a Helm pre-upgrade hook (the
`prisma-migrate` Job in `infra/helm/platform/templates/migrations-job.yaml`).
It blocks the rest of the rollout: the api/web/worker Deployments are
not updated until `prisma migrate deploy` exits 0 against the live
DATABASE_URL. To skip the hook (e.g. you ran it manually), pass
`--set migrations.enabled=false`.

```bash
SHA=$(git rev-parse --short HEAD)

# Pre-flight: dry-run + diff against the live release.
helm diff upgrade vibecore infra/helm/platform \
  --namespace vibecore \
  --values infra/helm/platform/values-prod.yaml \
  --set global.imageTag=sha-${SHA} 2>/dev/null || true

# Actual upgrade.
helm upgrade --install vibecore infra/helm/platform \
  --namespace vibecore \
  --create-namespace \
  --atomic \
  --timeout 10m \
  --values infra/helm/platform/values-prod.yaml \
  --set global.imageTag=sha-${SHA}
```

`--atomic` rolls back automatically on failure. The deploy refuses
`global.imageTag=latest` (Phase 0 A7 sentinel), so a missing `--set`
fails fast on ImagePullBackOff rather than silently pulling stale code.

---

### Tail the migration hook

```bash
kubectl logs -f -n vibecore job/vibecore-vibecore-platform-prisma-migrate
```

If the Job fails, `helm upgrade --atomic` rolls the whole release back
before any service pod is touched. Read the Job logs, fix forward (new
migration commit + re-build image + re-run Step 4) or restore from PITR
per [`ROLLBACK.md`](./ROLLBACK.md).

---

## Step 4 — Post-deploy smoke checks

```bash
# Pods are healthy + readiness probes passed.
kubectl get pods -n vibecore -l app.kubernetes.io/part-of=vibecore
kubectl get pods -n vibecore -l app.kubernetes.io/part-of=vibecore \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].ready}{"\n"}{end}'

# Public surface answers.
curl -fsSI https://app.e-code.ai/health | head -3   # → 200 + JSON
curl -fsS  https://app.e-code.ai/health             # → {"status":"ok"}
curl -fsS  https://app.e-code.ai/status | head -50  # → live component readout

# Synthetic probe ran by the deploy workflow (also runnable manually).
SYNTHETIC_BASE_URL=https://app.e-code.ai node scripts/synthetic-health-check.mjs

# Verify the new CronJobs are scheduled (siem.deliver + retention.enforce
# + workspace.gc). Each should have a NEXTSCHEDULE close to now.
kubectl get cronjobs -n vibecore

# Verify managed-mode cost ledger is recording. After a few real chats,
# /orgs/<orgId>/ai/cost-summary should return non-zero totals.
```

---

## Step 5 — Watch for the first 15 minutes

The first 5 min the `workspace.gc` CronJob shouldn't fire; the first
15 min mark is when its first reaper run reaches workspace-manager.
The next SIEM delivery fires within 5 min; verify both run cleanly.

```bash
# Live tail every service.
kubectl logs -f -n vibecore -l app.kubernetes.io/part-of=vibecore \
  --max-log-requests=20 --prefix=true

# Recent CronJob runs.
kubectl get jobs -n vibecore --sort-by=.metadata.creationTimestamp \
  | tail -15

# /metrics on api should expose chat usage:
kubectl exec -n vibecore deploy/vibecore-vibecore-platform-api -- \
  curl -fsS localhost:3001/metrics | grep ai_tokens_total
```

If you see any container in `CrashLoopBackOff` for more than 2 minutes,
roll back per [`ROLLBACK.md`](./ROLLBACK.md). The most common cause is
a missing secret in `vibecore-platform-secrets` — re-run Step 2 with
fresh values and `kubectl rollout restart deployment -n vibecore -l
app.kubernetes.io/part-of=vibecore`.

---

## Things this runbook does NOT handle yet

These are tracked as Phase 1 remaining work:

- **B5** — `packages/k8s-client` is still `execFile('kubectl')` for
  workspace pod orchestration. Reliable enough for the launch volume,
  but the workspace-manager replicas:2 (B4) made it more visible.
- **B8** — `scripts/backup-restore-dry-run.mjs` is a checksum stub.
  Real PITR validation still has to be a manual `gcloud sql instances
  clone` per [`ROLLBACK.md`](./ROLLBACK.md) until B8 lands.
- **B9** — `auth.account.delete` only purges Postgres rows; backups,
  S3 snapshots, and PVCs aren't reaped. Acceptable for the private
  beta; before GDPR-EU GA, ship B9.
- **OTEL exporter** — `OTEL_SERVICE_NAME` is set but
  `OTEL_EXPORTER_OTLP_ENDPOINT` is intentionally empty (no backend
  picked yet). Traces are dropped, metrics still surface via Prometheus.
- **Email transactionnel** — neither `SMTP_*` nor `EMAIL_HTTP_*` is
  populated. Signup/reset/invite flows that need email will fail
  silently until you wire Resend or SES.
