#!/usr/bin/env bash
set -euo pipefail
[[ ${VIBECORE_CI_EPHEMERAL_RUNTIME:-} == 1 ]]
[[ ${KUBECONFIG:-} == "$RUNNER_TEMP/vibecore-runtime/kubeconfig" ]]
: "${WORKSPACE_AGENT_IMAGE:?}"
kubectl -n workspaces apply -f - <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: runtime-gvisor-probe
spec:
  runtimeClassName: gvisor
  nodeSelector:
    vibecore.ai/node-pool: sandbox
  restartPolicy: Never
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: probe
      image: ${WORKSPACE_AGENT_IMAGE}
      imagePullPolicy: Never
      command: ["node", "-e", "setInterval(() => {}, 1000)"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
YAML
kubectl -n workspaces wait --for=condition=Ready pod/runtime-gvisor-probe --timeout=180s
kubectl -n workspaces exec runtime-gvisor-probe -- dmesg > "$RUNNER_TEMP/vibecore-runtime/evidence/gvisor-dmesg.txt"
grep -qi gvisor "$RUNNER_TEMP/vibecore-runtime/evidence/gvisor-dmesg.txt"
kubectl -n workspaces get pod runtime-gvisor-probe -o json > "$RUNNER_TEMP/vibecore-runtime/evidence/gvisor-probe.json"
kubectl -n workspaces delete pod runtime-gvisor-probe --wait=true --timeout=60s
