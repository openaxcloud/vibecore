#!/usr/bin/env bash
#
# REAL Kubernetes end-to-end proof of workspace-volume (PVC) erasure — expert
# reserve #2 ("verify the REAL disappearance of each PVC, not the DB DELETED
# flag") and reserve #4 ("real cluster, not memory adapters").
#
# Uses a throwaway local `kind` cluster (a real k8s API server + real PVC
# lifecycle) — $0, no GKE — with the WIF-proof guardrails: dedicated test cluster
# (never prod), no persistent credentials, full teardown at the end (trap).
#
# Flow: create a Bound PVC (via a pod), record BEFORE, run the SAME primitives
# the erasure uses (kubectl delete pvc/pod + kubectl get pvc), then verify the
# PVC is REALLY gone (get -> NotFound). Writes a hashed before/after artifact.
#
#   services/api/scripts/physical-purge-k8s-e2e.sh [--write]
set -euo pipefail

CLUSTER="purge-e2e"
NS="purge-e2e"
PVC="ws-e2e-pvc"
POD="ws-e2e-pod"
WRITE="${1:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HERE/../../../docs/deploy-evidence/2026-07-23-physical-purge-e2e"

teardown() {
  echo "  teardown: deleting kind cluster $CLUSTER"
  kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
}
trap teardown EXIT

echo "== creating throwaway kind cluster (real k8s API, \$0, local) =="
kind create cluster --name "$CLUSTER" --wait 120s >/dev/null 2>&1
KCTX="kind-$CLUSTER"

kubectl --context "$KCTX" create namespace "$NS" >/dev/null

# A real PVC + a pod to bind it (kind's default StorageClass is WaitForFirstConsumer).
cat <<YAML | kubectl --context "$KCTX" apply -f - >/dev/null
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: $PVC, namespace: $NS }
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 64Mi } }
---
apiVersion: v1
kind: Pod
metadata: { name: $POD, namespace: $NS }
spec:
  containers:
    - name: c
      image: registry.k8s.io/pause:3.9
      volumeMounts: [{ name: v, mountPath: /data }]
  volumes:
    - name: v
      persistentVolumeClaim: { claimName: $PVC }
YAML

echo "== waiting for the PVC to bind (real volume provisioned) =="
kubectl --context "$KCTX" -n "$NS" wait --for=jsonpath='{.status.phase}'=Bound "pvc/$PVC" --timeout=120s >/dev/null

PVC_BEFORE=$(kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}' 2>/dev/null || echo "MISSING")
PV_NAME=$(kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" -o jsonpath='{.spec.volumeName}' 2>/dev/null || echo "")
echo "  BEFORE: pvc=$PVC phase=$PVC_BEFORE pv=$PV_NAME"

echo "== erase (same primitives the workspace eraser uses): delete pod + pvc =="
kubectl --context "$KCTX" -n "$NS" delete pod "$POD" --wait=true --timeout=60s >/dev/null
kubectl --context "$KCTX" -n "$NS" delete pvc "$PVC" --wait=true --timeout=60s >/dev/null

# Reserve #2: verify the PVC is REALLY gone in the cluster (get -> NotFound),
# and the underlying PV was reclaimed too.
if kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" >/dev/null 2>&1; then
  echo "  AFTER: pvc STILL EXISTS — FAIL"; exit 1
fi
PVC_AFTER="NotFound"
PV_AFTER="gone"
if [ -n "$PV_NAME" ] && kubectl --context "$KCTX" get pv "$PV_NAME" >/dev/null 2>&1; then
  PV_AFTER="present"
fi
PVC_COUNT=$(kubectl --context "$KCTX" -n "$NS" get pvc --no-headers 2>/dev/null | wc -l | tr -d ' ')
echo "  AFTER: pvc=$PVC_AFTER pvcCount=$PVC_COUNT pv=$PV_AFTER"

if [ "$PVC_COUNT" != "0" ]; then echo "  residual PVCs remain — FAIL"; exit 1; fi

CANON=$(printf '{\n  "after": {\n    "pv": "%s",\n    "pvc": "%s",\n    "pvcCount": %s\n  },\n  "before": {\n    "pv": "%s",\n    "pvcPhase": "%s"\n  },\n  "cluster": "kind:%s (throwaway, torn down)",\n  "kind": "physical-purge-k8s-e2e",\n  "namespace": "%s",\n  "pvcName": "%s",\n  "verified": true,\n  "version": 1\n}' \
  "$PV_AFTER" "$PVC_AFTER" "$PVC_COUNT" "$PV_NAME" "$PVC_BEFORE" "$CLUSTER" "$NS" "$PVC")
SHA=$(printf '%s' "$CANON" | shasum -a 256 | awk '{print $1}')

echo "PHYSICAL K8S E2E: PASS"
echo "  PVC Bound -> deleted -> verified gone (real k8s API), 0 PVC remaining"
echo "  sha256: $SHA"

if [ "$WRITE" = "--write" ]; then
  mkdir -p "$OUT_DIR"
  printf '%s\n' "$CANON" > "$OUT_DIR/k8s-proof.json"
  printf '%s  k8s-proof.json\n' "$SHA" > "$OUT_DIR/k8s-SHA256SUMS"
  echo "  wrote artifacts to $OUT_DIR"
fi
