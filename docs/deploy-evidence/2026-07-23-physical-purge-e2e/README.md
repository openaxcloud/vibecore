# Physical account-purge erasure — REAL E2E proof (§16.12, PR #47 reserves)

Real before/after erasure proof on **actual GCS and Kubernetes**, not the memory
adapters the expert rejected. Two independent E2Es, each with the WIF-proof
guardrails: **dedicated TEST resources (never prod), no persistent credentials
(ADC / local kubeconfig), ~$0, full teardown**.

## 1. GCS — `gcs-proof.json` / `gcs-SHA256SUMS`

Runs the production adapter `GcsObjectStorage` driving `eraseSubjectStorage`
against a throwaway bucket in the **dedicated test project `ecode-proof-b906ss`**
(never prod `vibecore-495216`):

- BEFORE: 3 real objects listed in a real bucket `vc-purgee2e…`.
- ERASE: the real erasure path deletes the bucket.
- AFTER (live re-check, reserve #2/#4): `bucketExists=false`, `objectsRemaining=0`,
  `verified=true`.
- Teardown: the erasure deletes the bucket; a `finally` force-deletes it if the
  run ever leaked one. Verified 0 test buckets remain.

Replay: `GCP_TEST_PROJECT=ecode-proof-b906ss npx tsx services/api/scripts/physical-purge-gcs-e2e.ts --write`

## 2. Kubernetes — `k8s-proof.json` / `k8s-SHA256SUMS`

Runs against a throwaway **local `kind` cluster** — a real Kubernetes API server
and real PVC lifecycle at **$0**, chosen over GKE per the "stop if heavy/costly"
guardrail (a real k8s cluster, no cloud cost). Proves reserve #2 (verify the
**real** PVC disappearance, not the DB `DELETED` flag):

- BEFORE: a real **Bound** PVC (with a provisioned PV), mounted by a pod.
- ERASE: `kubectl delete pod + pvc` (the same primitives the workspace eraser
  uses via workspace-manager's k8s-client).
- AFTER (live `get pvc` → NotFound): `pvcCount=0`, `verified=true`.
- Teardown: `kind delete cluster` in an EXIT trap — the cluster and everything in
  it (incl. the PV) is destroyed.

Replay: `bash services/api/scripts/physical-purge-k8s-e2e.sh --write`

## Cost & teardown

| Resource | Where | Cost | Teardown |
| --- | --- | --- | --- |
| GCS bucket + 3 tiny objects | test project `ecode-proof-b906ss` | ~$0 (deleted in seconds) | erasure + `finally` force-delete; 0 left |
| kind cluster + 64Mi PVC | local Docker | $0 (no cloud) | `kind delete cluster` EXIT trap |

No GKE cluster was created (would have been the only "heavy/costly" option); a
local `kind` cluster satisfies "real k8s" at $0, so no cost sign-off was needed.
No persistent keys: GCS uses ADC (the reviewer's gcloud login), k8s uses the
local kind kubeconfig.

## The four reserves (code)

- **#1 write barrier** — `eraseSubjectStorage` calls `WriteBarrierPort.freeze`
  BEFORE any delete; a freeze failure aborts erasure (nothing deleted, not
  verified). Prod path: workspace-manager `POST /workspaces/:id/freeze` (revoke
  token + stop pod).
- **#2 real disappearance** — verification re-checks the LIVE backend (GCS list /
  `GET /workspaces/:id/pvc-exists` → real `get pvc`), never a DB flag.
- **#3 by data subject** — the inventory erases the subject's sole-org buckets
  AND their per-user workspace in EVERY project they touched (sole-org +
  collaborator), not just one main `workspaceId`.
- **#4 real proof** — the two artifacts above.
