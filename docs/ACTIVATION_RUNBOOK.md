# Activation runbook — 3 prod-infra actions (for Avi)

All backend code is merged on `main`, **gated/dormant** — prod behaviour is
unchanged until the steps below are run. These three actions were intentionally
**not** automated (they elevate IAM / modify shared prod infra). Each step lists
exact commands, impact, and rollback.

**Common context**

```bash
export CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
export PROJECT=vibecore-495216
export NS=vibecore                      # platform namespace
export GSA=vibecore-prod-platform@vibecore-495216.iam.gserviceaccount.com
export KSA=vibecore-vibecore-platform-api
export API_DEPLOY=vibecore-vibecore-platform-api
```

> The CD already deployed the new `api` + `workspace-manager` images on push
> `57b72fad` (runtime tier = api+ws-manager+preview-proxy). So the executor
> code, the manager secret-guard, and the hibernation reconciler are **already
> live in the running images** — these steps only flip the switches they gate.

---

## 1. Object Storage — give the api pod a GCS identity  ·  **recommended: Path A (Workload Identity)**

**Why Path A over Path B.** Path A (WI) issues short-lived, auto-rotated,
storage-scoped tokens — nothing long-lived to leak. Path B mounts a permanent
JSON key (an SSRF/file-read in the api could exfiltrate it, and it never
expires). The one cost of Path A is opening a *narrowly scoped* metadata-egress
hole for api pods only; with WI that hole only yields the bound storage-scoped
GSA token, never the node identity. Recommended: **Path A**.

### Path A — Workload Identity (recommended)

```bash
# 1a. storage role for the platform GSA (today it only has secretAccessor)
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$GSA" --role="roles/storage.admin" --condition=None

# 1b. let the api KSA impersonate the GSA (Workload Identity binding)
gcloud iam service-accounts add-iam-policy-binding "$GSA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT}.svc.id.goog[${NS}/${KSA}]"

# 1c. annotate the KSA
kubectl --context="$CTX" annotate sa "$KSA" -n "$NS" \
  iam.gke.io/gcp-service-account="$GSA" --overwrite

# 1d. let the GSA sign V4 URLs without a key (IAM signBlob on itself)
gcloud iam service-accounts add-iam-policy-binding "$GSA" \
  --role="roles/iam.serviceAccountTokenCreator" --member="serviceAccount:$GSA"

# 1e. open a SCOPED metadata-egress hole for api pods (concealment is on by default)
cat <<'YAML' | kubectl --context="$CTX" apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-metadata-egress
  namespace: vibecore
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: api
  policyTypes: [Egress]
  egress:
    - to:
        - ipBlock: { cidr: 169.254.169.254/32 }
      ports:
        - { protocol: TCP, port: 80 }
        - { protocol: TCP, port: 988 }   # GKE metadata server
YAML

# 1f. flip the flag + roll the api
kubectl --context="$CTX" set env deploy/$API_DEPLOY -n "$NS" OBJECT_STORAGE_ENABLED=true
kubectl --context="$CTX" rollout status deploy/$API_DEPLOY -n "$NS"
```

**Verify**

```bash
POD=$(kubectl --context="$CTX" get pod -n "$NS" -l app.kubernetes.io/name=api \
  -o jsonpath='{.items[0].metadata.name}')
# pick any project id you own; expect HTTP 200 + {bucket,created,location}
kubectl --context="$CTX" exec -n "$NS" "$POD" -c api -- \
  node -e 'fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",{headers:{"Metadata-Flavor":"Google"}}).then(r=>r.text()).then(t=>console.log("identity:",t))'
# -> should print vibecore-prod-platform@...  (was a timeout before WI)
```

- **Impact:** dormant Object-Storage routes start serving; api pods (only) can
  now reach the metadata server for a storage-scoped token.
- **Rollback:** `kubectl set env deploy/$API_DEPLOY -n $NS OBJECT_STORAGE_ENABLED-`;
  `kubectl delete networkpolicy allow-api-metadata-egress -n $NS`;
  `kubectl annotate sa $KSA -n $NS iam.gke.io/gcp-service-account-`;
  remove the IAM bindings with the matching `gcloud ... remove-iam-policy-binding`.

### Path B — mounted key Secret (alternative, no netpol change)

```bash
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$GSA" --role="roles/storage.admin" --condition=None
gcloud iam service-accounts keys create /tmp/os-key.json --iam-account="$GSA"
kubectl --context="$CTX" create secret generic object-storage-gcs-key \
  -n "$NS" --from-file=key.json=/tmp/os-key.json
# mount the secret at e.g. /var/secrets/gcs and set, then roll the api:
kubectl --context="$CTX" set env deploy/$API_DEPLOY -n "$NS" \
  OBJECT_STORAGE_ENABLED=true GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/gcs/key.json
rm -f /tmp/os-key.json   # never keep the key on disk
```
- Signing is local (no metadata, no signBlob), so **no NetworkPolicy change**.
- **Rollback:** unset the two env vars, `kubectl delete secret object-storage-gcs-key -n $NS`, and `gcloud iam service-accounts keys delete <KEY_ID> --iam-account=$GSA`.

---

## 2. FREE tier — bootstrap `shared-pg-0` + the tenant secret

The shared HA Postgres cluster does not exist yet (the Helm template ships
gated off). The api/ws-manager images already carry the provisioning code.

```bash
# 2a. bootstrap the shared HA cluster + pooler (gated key, survives --reuse-values)
helm upgrade vibecore infra/helm/platform \
  --namespace "$NS" --reuse-values \
  --set platformEnv.runtime.previewUrlTemplate=https://{workspaceId}-{port}.preview.e-code.ai/ \
  --set database.sharedCluster.enabled=true
# wait until healthy:
kubectl --context="$CTX" get cluster.postgresql.cnpg.io shared-pg-0 -n project-databases -w

# 2b. the tenant-password HMAC secret (any strong random string; keep it stable)
SECRET=$(openssl rand -hex 32)
kubectl --context="$CTX" set env deploy/$API_DEPLOY -n "$NS" DB_SHARED_TENANT_SECRET="$SECRET"
kubectl --context="$CTX" rollout status deploy/$API_DEPLOY -n "$NS"
```

> `kubectl set env` is ephemeral (reverts on the next `helm upgrade`). To make
> it permanent, store it as a k8s Secret and add the env ref to the api
> deployment in `infra/helm/platform` (codify in a follow-up commit).

**Verify**

```bash
# cluster healthy + pooler running
kubectl --context="$CTX" get cluster.postgresql.cnpg.io shared-pg-0 -n project-databases
kubectl --context="$CTX" get pooler.postgresql.cnpg.io shared-pg-0-pooler -n project-databases
# the app role was granted CREATEDB+CREATEROLE by postInitSQL:
kubectl --context="$CTX" exec -n project-databases shared-pg-0-1 -c postgres -- \
  psql -U postgres -tAc "SELECT rolcreatedb AND rolcreaterole FROM pg_roles WHERE rolname='app'"   # -> t
```
Then provision a DB on any FREE-plan project and read `GET /projects/:id/database`
(dev) and `GET /projects/:id/database?environment=production` after publish — each
flips to `ACTIVE` with a URL on `shared-pg-0-pooler.project-databases.svc:5432`,
DB `proj_<id>` (dev) / `proj_<id>_prod` (prod). Confirm the per-tenant isolation:
```bash
kubectl --context="$CTX" exec -n project-databases shared-pg-0-1 -c postgres -- \
  psql -U postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'proj\_%'"   # the tenant DBs
```

- **Impact:** free projects begin getting a real isolated logical DB (dev + prod)
  on the shared cluster. While `database.sharedCluster.enabled=false` (default) or
  `DB_SHARED_TENANT_SECRET` is unset, the path stays inert.
- **Rollback:** `helm upgrade … --set database.sharedCluster.enabled=false` (then
  `kubectl delete cluster.postgresql.cnpg.io shared-pg-0 -n project-databases`);
  `kubectl set env deploy/$API_DEPLOY -n $NS DB_SHARED_TENANT_SECRET-`.

---

## 3. Hibernation reconciler — already live

The sleep/wake reconciler lives in `workspace-manager` and shipped with the
runtime-tier image on push `57b72fad`. **No new action** beyond confirming the
rollout landed:

```bash
kubectl --context="$CTX" rollout status \
  deploy/vibecore-vibecore-platform-workspace-manager -n "$NS"
# the worker's BullMQ `workspace.gc` cron drives it on a schedule
```

**Verify** — the reconciler logs each transition; confirm it is sweeping:
```bash
# the cron enqueues workspace.gc; the manager logs stop/reconcile decisions
kubectl --context="$CTX" logs -n "$NS" deploy/vibecore-vibecore-platform-workspace-manager --since=1h \
  | grep -iE "garbage|stop|reconcile|gc" | tail
# end-to-end: open a project, leave it idle > WORKSPACE_INACTIVE_MS (default 30m),
# then check its WorkspaceRuntime flips RUNNING -> STOPPED (pod deleted, PVC kept),
# and reopening re-provisions a fresh pod from the kept PVC.
```

- **Impact:** idle workspaces stop (PVC kept) and reopen re-provisions; orphaned
  RUNNING rows (pod gone) self-heal to STOPPED. Already the intended behaviour.
- **Rollback:** `helm rollback vibecore <prev-revision> -n $NS` (reverts the
  runtime-tier image).
