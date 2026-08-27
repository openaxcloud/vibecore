#!/usr/bin/env bash

# Probe the deployed API from inside the cluster while password activation is
# held closed. A conclusive 2xx is a security failure. Transport/tooling errors
# are inconclusive: keep activation closed without misreporting a healthy Helm
# rollout as failed.

set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
: "${HELM_NAMESPACE:?HELM_NAMESPACE is required}"
: "${HELM_RELEASE:?HELM_RELEASE is required}"

PROBE_POD_NAME="sec9-probe-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
if ! printf '%s' "${PROBE_POD_NAME}" | grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' ||
  [ "${#PROBE_POD_NAME}" -gt 63 ]; then
  echo "::error::invalid exact SEC-9 probe pod name '${PROBE_POD_NAME}'" >&2
  exit 1
fi

PROBE_WORK_DIR="$(mktemp -d)"
PROBE_STDOUT="${PROBE_WORK_DIR}/stdout"
PROBE_STDERR="${PROBE_WORK_DIR}/stderr"

cleanup() {
  # Delete exactly the pod created by this run attempt. Never widen this to a
  # label selector, namespace sweep or --all cleanup.
  kubectl -n "${HELM_NAMESPACE}" delete pod "${PROBE_POD_NAME}" \
    --ignore-not-found=true --wait=false --request-timeout=15s >/dev/null 2>&1 || true
  rm -rf -- "${PROBE_WORK_DIR}"
}
trap cleanup EXIT

publish_result() {
  local armable="$1"
  local result="$2"
  local http_code="${3:-}"
  {
    echo "armable=${armable}"
    echo "result=${result}"
    echo "http_code=${http_code}"
  } >>"${GITHUB_OUTPUT}"
}

# Do not place this command in a command substitution under `set -e`: kubectl
# can return non-zero after a healthy rollout (attach/cleanup/network errors).
# Capture stdout, stderr and status independently so the refusal decision and
# diagnostic survive every transport outcome.
set +e
kubectl -n "${HELM_NAMESPACE}" run "${PROBE_POD_NAME}" \
  --restart=Never \
  --attach=true \
  --quiet \
  --pod-running-timeout=60s \
  --image=curlimages/curl:8.10.1 \
  --labels="app.kubernetes.io/name=sec9-probe,vibecore.dev/github-run-id=${GITHUB_RUN_ID}" \
  --command -- curl -sS -o /dev/null -w '%{http_code}\n' -m 15 -X PUT \
  "http://${HELM_RELEASE}-vibecore-platform-api.${HELM_NAMESPACE}.svc:3001/projects/sec9-probe/deployments/sec9-probe/access" \
  -H 'content-type: application/json' \
  -d '{"mode":"PASSWORD_PROTECTED","password":"sec9-probe-not-a-real-password","expectedVersion":1}' \
  >"${PROBE_STDOUT}" 2>"${PROBE_STDERR}"
PROBE_COMMAND_STATUS=$?
set -e

PROBE_OUTPUT="$(tr -d '\r\n' <"${PROBE_STDOUT}")"
echo "SEC-9 probe command status: ${PROBE_COMMAND_STATUS}"
echo "SEC-9 probe stdout: '${PROBE_OUTPUT}'"
if [ -s "${PROBE_STDERR}" ]; then
  echo "SEC-9 probe stderr follows:" >&2
  sed -n '1,80p' "${PROBE_STDERR}" >&2
fi

if [ "${PROBE_COMMAND_STATUS}" -ne 0 ] ||
  ! printf '%s' "${PROBE_OUTPUT}" | grep -Eq '^[0-9]{3}$' ||
  [ "${PROBE_OUTPUT}" = '000' ]; then
  publish_result 'false' 'inconclusive'
  echo "::warning::PHASE-1 PROBE INCONCLUSIVE — activation remains closed at DEPLOYMENT_ACCESS_ACTIVATION_ENABLED=0; phase 2 will not run. The successful rollout is not marked failed."
  exit 0
fi

case "${PROBE_OUTPUT}" in
  2*)
    publish_result 'false' 'unsafe-success' "${PROBE_OUTPUT}"
    echo "::error::PHASE-1 PROBE FAILED — the deployed api answered ${PROBE_OUTPUT} to an activation request while the interlock is supposed to be CLOSED. Not arming activation." >&2
    exit 1
    ;;
  *)
    publish_result 'true' 'refused' "${PROBE_OUTPUT}"
    echo "ok — deployed api refused activation with HTTP ${PROBE_OUTPUT} while the interlock is closed"
    ;;
esac
