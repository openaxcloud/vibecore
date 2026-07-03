# Activation runbook — PITR/DB-rollback + Private preview ports

> Live-verified 2026-06-30 against prod (`connectgateway_vibecore-495216_europe-west9_vibecore-prod-app`).
> "OPERATIONAL" = confirmed working live. "AVI" = needs an IAM/secret step reserved to the owner.
> Golden rule: the enforcement flip in (B) is the LAST step — flipping early 401s owners on their own private ports.

---

## A) PITR / DB rollback (CloudNativePG)

### Already active (operational)
- **CNPG operator v1.29.1** installed, ns `cnpg-system` (Running). CRDs established.
- **`DB_ROLLBACK_ENABLED: "true"`** — baked literal in `infra/helm/platform/templates/configmap.yaml`
  (survives `helm upgrade --reuse-values`). Also `DB_BACKUP_BUCKET`, `DB_BACKUP_GSA`, `DB_SHARED_CLUSTER`.
- **Provisioner + routes** wired: `services/api/src/database-provisioner.ts` (CnpgProvisioner) +
  `POST /projects/:id/database/{provision,snapshots,restores}`, `GET /projects/:id/database`
  (`services/api/src/app.ts`). Restore builds a recovery Cluster with
  `bootstrap.recovery.recoveryTarget.targetTime` + `externalClusters[].barmanObjectStore`.
- **Per-project cluster live**: `db-cmqunmv1b…` (project `cmqunmv1b…`), healthy, with a daily
  `ScheduledBackup` (02:00) → `gs://vibecore-495216-vibecore-prod-backups/db/<projectId>`.

### BROKEN — root-caused (live evidence)
The cluster's WAL archiving is **failing**, so no recovery points are actually produced:

```
Cluster status.conditions[type=ContinuousArchiving]:
  status: "False"  reason: ContinuousArchivingFailing
  message: 'unexpected failure invoking barman-cloud-wal-archive: exit status 4'
Backup db-cmqunmv1b…-daily-20260629020000: phase: walArchivingFailing
```

**Cause (confirmed):** the manifest is correct — the per-cluster ServiceAccount
`project-databases/db-cmqunmv1b…` carries `iam.gke.io/gcp-service-account: cnpg-backups@…`.
But CNPG names each project's SA **after the cluster** (`db-<projectId>`), and Phase-1 only
WI-bound the GSA to a single fixed KSA (`cnpg-backups`). So each new project's cluster KSA
cannot impersonate the GSA → GCS auth fails → `exit status 4`. The GSA already has bucket
access (Phase-1 smoke test wrote to `db/`), so the gap is purely the **Workload-Identity
member binding**, and the fix must cover *all current + future* per-project KSAs in the namespace.

### ➜ AVI — one IAM command (namespace-wide WI binding)
Bind the GSA to the **whole `project-databases` namespace** principalSet so every per-project
CNPG KSA (present and future) can impersonate it:

```bash
PROJECT_ID=vibecore-495216
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
GSA=cnpg-backups@${PROJECT_ID}.iam.gserviceaccount.com

gcloud iam service-accounts add-iam-policy-binding "$GSA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${PROJECT_ID}.svc.id.goog/namespace/project-databases"

# (bucket role already present from Phase 1; re-assert if unsure:)
gsutil iam ch "serviceAccount:${GSA}:roles/storage.objectAdmin" \
  gs://vibecore-495216-vibecore-prod-backups
```

### Post-fix verification (operator, after the binding)
```bash
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
# 1. Force a fresh WAL + a base backup, then watch archiving recover:
kubectl --context $CTX -n project-databases annotate cluster db-cmqunmv1b000a0n5jozw43l39 \
  cnpg.io/reconcile="$(date +%s)" --overwrite
kubectl --context $CTX -n project-databases get cluster db-cmqunmv1b000a0n5jozw43l39 \
  -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")].status}'   # want: True
# 2. On-demand backup should reach 'completed':
kubectl --context $CTX -n project-databases create -f - <<'YAML'
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata: { name: db-cmqunmv1b000a0n5jozw43l39-verify, namespace: project-databases }
spec: { cluster: { name: db-cmqunmv1b000a0n5jozw43l39 }, method: barmanObjectStore }
YAML
kubectl --context $CTX -n project-databases get backup db-cmqunmv1b000a0n5jozw43l39-verify -w
```
Once `ContinuousArchiving=True` and a backup is `completed`, recovery points exist and the
per-project restore endpoint (`POST /projects/:id/database/restores` with `targetTimestamp`)
can rebuild a point-in-time Cluster. Until then, restore CRs apply but have no WAL to recover.

> Note: the **deployed api image predates** some DB routes — verify the running api sha carries
> `/database/restores` before relying on the HTTP path; the code is on `main`, so a normal CD
> deploy brings it. The operator-level backup/restore above is independent of the api image.

---

## B) Private preview ports (Replit "port visibility")

### Component status (live-verified)
| piece | where | status |
|---|---|---|
| Proxy enforcement (`PREVIEW_ENFORCE_PRIVATE_PORTS`, 401 on private+no-session, public open) | `services/preview-proxy/src/app.ts:322,473` | **in the DEPLOYED image** `preview-proxy:25f543e3` ✓ |
| Per-port toggle (`set-visibility` → `VIBECORE_PORTS_STATE`) | `app/routes/api.projects.$projectId.ide-panel.$panel.ts:1662` | present ✓ |
| api lookup `GET /internal/preview/port-access` | `services/api/src/app.ts` (commit `56199a50`) | **NOT in deployed api** `a0a34eb6` ✗ → needs redeploy |
| `PREVIEW_PRIVATE_PORTS_ENABLED: "true"` (api returns real data) + `API_BASE_URL` | configmap | baked ✓ |
| `vc_preview` cookie **mint** (HttpOnly, `Domain=.e-code.ai`, HMAC via `signPreviewTenantToken`) | — | **MISSING everywhere** ✗ |
| `PREVIEW_TENANT_SECRET` | secret `vibecore-platform-secrets` | not set ✗ |
| `PREVIEW_ENFORCE_PRIVATE_PORTS` | configmap | `false` (dark-launch) |

**Why you can't just flip the flag:** the proxy gate lets a private port through only for a
request carrying a valid `vc_preview` cookie — but **no pod mints that cookie**. Flip enforcement
now and any port a user marks *private* returns 401 to **everyone including its owner** (public
ports are unaffected). Also the *deployed* api lacks the port-access lookup, so today the proxy
would fail-open (treat all ports public) regardless. Two code/deploy gaps must close first.

### Staged activation (safety order — flip is LAST)

**Step 1 — mint the `vc_preview` cookie (web, real code).** On an authenticated IDE response,
`Set-Cookie: vc_preview=<signPreviewTenantToken(orgId, now+12h, PREVIEW_TENANT_SECRET)>;
Domain=.e-code.ai; HttpOnly; Secure; SameSite=None; Path=/`. Sign with the same
`signPreviewTenantToken` the proxy verifies (exported from preview-proxy; move it to a shared
module or re-implement identically). Gate on `PREVIEW_TENANT_SECRET` being present (no secret →
no cookie → no behavior change).

**Step 2 — set the secret (internal app HMAC; operational).**
```bash
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
SECRET=$(openssl rand -hex 32)
kubectl --context $CTX -n vibecore patch secret vibecore-platform-secrets --type merge \
  -p "{\"stringData\":{\"PREVIEW_TENANT_SECRET\":\"$SECRET\"}}"
# restart consumers so they pick it up:
kubectl --context $CTX -n vibecore rollout restart deploy/vibecore-vibecore-platform-web \
  deploy/vibecore-vibecore-platform-preview-proxy
```
`vibecore-platform-secrets` is externally-managed (helm-safe): the key persists across
`helm upgrade`. Both web (mints) and preview-proxy (verifies) mount it via `envFrom`.

**Step 3 — redeploy api + web** to a `main` sha that carries `/internal/preview/port-access`
(api) and the Step-1 cookie mint (web). Normal CD on merge does this.

**Step 4 — flip enforcement (baked, LAST).** In `templates/configmap.yaml`, change the
dark-launch literal:
```yaml
PREVIEW_ENFORCE_PRIVATE_PORTS: "true"   # was implicitly off
```
Baked literal (not a `.Values` key) so `helm upgrade --reuse-values` keeps it — same pattern as
`DB_ROLLBACK_ENABLED`. Commit + merge → CD re-renders the configmap and rolls preview-proxy.

### Verification (proves the acceptance bar)
```bash
# Pick a disposable test workspace with two ports; mark one private via the IDE Ports panel
# (set-visibility → VIBECORE_PORTS_STATE), leave the other public. Then, in-cluster:
CTX=… ; PROXY=vibecore-vibecore-platform-preview-proxy.vibecore.svc
# public port → proxies (NOT 401):
kubectl --context $CTX -n vibecore run t --rm -i --image=curlimages/curl --restart=Never -- \
  -s -o /dev/null -w '%{http_code}\n' http://$PROXY/p/<ws>/<publicPort>/
# private port, no cookie → 401:
… http://$PROXY/p/<ws>/<privatePort>/            # expect 401
# private port, valid vc_preview cookie (owner) → passes gate:
… -H 'Cookie: vc_preview=<signed-token>' http://$PROXY/p/<ws>/<privatePort>/   # expect not-401
```
Acceptance: **private ⇒ 401 without a session, open with the owner's cookie; public ⇒ always open.**

---

## Summary
- **A**: fully wired + flag on; the ONE blocker is a namespace-wide Workload-Identity binding
  (Avi command above). After it, WAL archiving recovers and PITR is end-to-end usable.
- **B**: proxy enforcement is deployed; blocked on (1) minting the `vc_preview` cookie in web
  [code], (2) redeploying api with the port-access lookup, (3) setting `PREVIEW_TENANT_SECRET`,
  then (4) flipping the flag LAST. Public previews are never affected at any step.
