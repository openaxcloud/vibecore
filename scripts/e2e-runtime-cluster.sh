#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly SAFE_CLUSTER_PREFIX='vibecore-e2e-runtime-'
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

owner_marker_path() {
  printf '%s.owner\n' "${E2E_RUNTIME_KUBECONFIG}"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "required command not found: $1" >&2
    exit 1
  fi
}

require_env() {
  local key="$1"

  if [[ -z "${!key:-}" ]]; then
    echo "required environment variable is empty: ${key}" >&2
    exit 1
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1"
  else
    echo 'required command not found: sha256sum or shasum' >&2
    exit 1
  fi
}

validate_target() {
  require_env E2E_RUNTIME_CLUSTER_NAME
  require_env E2E_RUNTIME_KUBECONFIG
  require_env E2E_RUNTIME_NAMESPACE
  require_env E2E_RUNTIME_AGENT_IMAGE

  if [[ "${E2E_RUNTIME_CLUSTER_NAME}" != "${SAFE_CLUSTER_PREFIX}"* ]] ||
    [[ ! "${E2E_RUNTIME_CLUSTER_NAME}" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    echo "refusing unsafe E2E runtime cluster name: ${E2E_RUNTIME_CLUSTER_NAME}" >&2
    exit 1
  fi

  if [[ "${E2E_RUNTIME_KUBECONFIG}" != /* ]] ||
    [[ ! "$(basename "${E2E_RUNTIME_KUBECONFIG}")" =~ ^vibecore-e2e-runtime[-a-z0-9.]*\.kubeconfig$ ]]; then
    echo 'E2E_RUNTIME_KUBECONFIG must be an absolute, runtime-specific .kubeconfig path' >&2
    exit 1
  fi

  if [[ ! "${E2E_RUNTIME_NAMESPACE}" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    echo "invalid E2E runtime namespace: ${E2E_RUNTIME_NAMESPACE}" >&2
    exit 1
  fi

  if [[ ! "${E2E_RUNTIME_AGENT_IMAGE}" =~ ^vibecore/workspace-agent:e2e-[a-f0-9]{40}$ ]]; then
    echo "agent image must be bound to the full audited SHA: ${E2E_RUNTIME_AGENT_IMAGE}" >&2
    exit 1
  fi
}

verified_source_sha() {
  local source_sha
  local audited_sha
  local image_sha
  source_sha="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  audited_sha="${GITHUB_SHA:-${source_sha}}"
  image_sha="${E2E_RUNTIME_AGENT_IMAGE##*:e2e-}"

  if [[ ! "${source_sha}" =~ ^[a-f0-9]{40}$ ]] || [[ ! "${audited_sha}" =~ ^[a-f0-9]{40}$ ]]; then
    echo "source and audited SHAs must be full lowercase Git SHAs: source=${source_sha} audited=${audited_sha}" >&2
    exit 1
  fi

  if [[ "${source_sha}" != "${audited_sha}" ]] || [[ "${image_sha}" != "${audited_sha}" ]]; then
    echo "refusing runtime image/source mismatch: source=${source_sha} audited=${audited_sha} image=${image_sha}" >&2
    exit 1
  fi

  printf '%s\n' "${audited_sha}"
}

assert_owned_target() {
  local marker
  local owner
  marker="$(owner_marker_path)"

  if [[ ! -f "${marker}" ]]; then
    echo "refusing unowned E2E runtime target (marker missing): ${E2E_RUNTIME_CLUSTER_NAME}" >&2
    exit 1
  fi

  owner="$(<"${marker}")"

  if [[ "${owner}" != "${E2E_RUNTIME_CLUSTER_NAME}" ]]; then
    echo "refusing E2E runtime owner mismatch: ${owner:-<empty>}" >&2
    exit 1
  fi
}

list_clusters() {
  kind get clusters 2>/dev/null || true
}

cluster_exists() {
  list_clusters | grep -Fxq -- "${E2E_RUNTIME_CLUSTER_NAME}"
}

kubectl_e2e() {
  kubectl \
    --kubeconfig "${E2E_RUNTIME_KUBECONFIG}" \
    --context "kind-${E2E_RUNTIME_CLUSTER_NAME}" \
    "$@"
}

assert_up() {
  if ! cluster_exists; then
    echo "kind cluster is absent: ${E2E_RUNTIME_CLUSTER_NAME}" >&2
    exit 1
  fi

  local configured_context
  configured_context="$(kubectl --kubeconfig "${E2E_RUNTIME_KUBECONFIG}" config current-context)"

  if [[ "${configured_context}" != "kind-${E2E_RUNTIME_CLUSTER_NAME}" ]]; then
    echo "kubeconfig context mismatch: ${configured_context}" >&2
    exit 1
  fi

  kubectl_e2e cluster-info >/dev/null
  kubectl_e2e get namespace "${E2E_RUNTIME_NAMESPACE}" >/dev/null
}

up() {
  require_command docker
  require_command kind
  require_command kubectl
  verified_source_sha >/dev/null

  if cluster_exists; then
    echo "refusing to reuse existing cluster: ${E2E_RUNTIME_CLUSTER_NAME}" >&2
    exit 1
  fi

  if [[ -e "${E2E_RUNTIME_KUBECONFIG}" || -e "$(owner_marker_path)" ]]; then
    echo "refusing to overwrite pre-existing runtime identity state: ${E2E_RUNTIME_KUBECONFIG}" >&2
    exit 1
  fi

  mkdir -p "$(dirname "${E2E_RUNTIME_KUBECONFIG}")"
  printf '%s\n' "${E2E_RUNTIME_CLUSTER_NAME}" >"$(owner_marker_path)"
  kind create cluster \
    --name "${E2E_RUNTIME_CLUSTER_NAME}" \
    --image "${KIND_NODE_IMAGE:-kindest/node:v1.34.0}" \
    --kubeconfig "${E2E_RUNTIME_KUBECONFIG}" \
    --wait 120s

  kubectl_e2e create namespace "${E2E_RUNTIME_NAMESPACE}"
  docker build \
    --file services/workspace-agent/Dockerfile \
    --tag "${E2E_RUNTIME_AGENT_IMAGE}" \
    .
  kind load docker-image \
    --name "${E2E_RUNTIME_CLUSTER_NAME}" \
    "${E2E_RUNTIME_AGENT_IMAGE}"

  assert_up

  local image_id
  image_id="$(docker image inspect "${E2E_RUNTIME_AGENT_IMAGE}" --format '{{.Id}}')"
  printf '{"ok":true,"cluster":"%s","context":"kind-%s","namespace":"%s","image":"%s","imageId":"%s"}\n' \
    "${E2E_RUNTIME_CLUSTER_NAME}" \
    "${E2E_RUNTIME_CLUSTER_NAME}" \
    "${E2E_RUNTIME_NAMESPACE}" \
    "${E2E_RUNTIME_AGENT_IMAGE}" \
    "${image_id}"
}

evidence() {
  require_command jq
  assert_up

  local output_path="${1:-runtime-e2e-evidence.json}"
  local audited_sha
  audited_sha="$(verified_source_sha)"
  local pods_json
  local storage_json
  local workspace_count
  local unhealthy_count
  local unexpected_image_count
  local missing_image_digest_count

  if [[ ! "${audited_sha}" =~ ^[a-f0-9]{40}$ ]]; then
    echo "audited SHA must be full length: ${audited_sha}" >&2
    exit 1
  fi

  pods_json="$(kubectl_e2e --namespace "${E2E_RUNTIME_NAMESPACE}" get pods -o json)"
  storage_json="$(kubectl_e2e --namespace "${E2E_RUNTIME_NAMESPACE}" get pvc -o json)"
  workspace_count="$(jq '[.items[] | select(.metadata.labels["vibecore.ai/workspace-id"] != null)] | length' <<<"${pods_json}")"
  unhealthy_count="$(
    jq '[.items[] | select(.metadata.labels["vibecore.ai/workspace-id"] != null) | select(
      .status.phase != "Running" or
      ([.status.containerStatuses[]?.ready] | any(. == false))
    )] | length' <<<"${pods_json}"
  )"
  unexpected_image_count="$(
    jq --arg expected "${E2E_RUNTIME_AGENT_IMAGE}" \
      '[.items[] | select(.metadata.labels["vibecore.ai/workspace-id"] != null) | select(.spec.containers[0].image != $expected)] | length' \
      <<<"${pods_json}"
  )"
  missing_image_digest_count="$(
    jq '[.items[] | select(.metadata.labels["vibecore.ai/workspace-id"] != null) | select(
      (.status.containerStatuses[0].imageID // "") | test("sha256:") | not
    )] | length' <<<"${pods_json}"
  )"

  if [[ "${workspace_count}" -lt 1 ]]; then
    echo 'no real workspace pod was observed' >&2
    exit 1
  fi

  if [[ "${unhealthy_count}" -ne 0 ]]; then
    echo "unhealthy workspace pods observed: ${unhealthy_count}" >&2
    exit 1
  fi

  if [[ "${unexpected_image_count}" -ne 0 ]]; then
    echo "workspace pods are not running the exact audited image: ${unexpected_image_count}" >&2
    exit 1
  fi

  if [[ "${missing_image_digest_count}" -ne 0 ]]; then
    echo "workspace pods without a resolved sha256 imageID: ${missing_image_digest_count}" >&2
    exit 1
  fi

  jq -n \
    --arg auditedSha "${audited_sha}" \
    --arg cluster "${E2E_RUNTIME_CLUSTER_NAME}" \
    --arg context "kind-${E2E_RUNTIME_CLUSTER_NAME}" \
    --arg namespace "${E2E_RUNTIME_NAMESPACE}" \
    --arg image "${E2E_RUNTIME_AGENT_IMAGE}" \
    --argjson pods "${pods_json}" \
    --argjson pvcs "${storage_json}" \
    '{
      schemaVersion: 1,
      auditedSha: $auditedSha,
      cluster: $cluster,
      context: $context,
      namespace: $namespace,
      expectedAgentImage: $image,
      observedAt: (now | todateiso8601),
      workspacePods: [
        $pods.items[] |
        select(.metadata.labels["vibecore.ai/workspace-id"] != null) |
        {
          name: .metadata.name,
          workspaceId: .metadata.labels["vibecore.ai/workspace-id"],
          phase: .status.phase,
          runtimeClassName: (.spec.runtimeClassName // null),
          image: .spec.containers[0].image,
          imageID: .status.containerStatuses[0].imageID,
          ready: .status.containerStatuses[0].ready,
          restartCount: .status.containerStatuses[0].restartCount
        }
      ],
      persistentVolumeClaims: [
        $pvcs.items[] | { name: .metadata.name, phase: .status.phase, storageClassName: .spec.storageClassName }
      ]
    }' >"${output_path}"

  sha256_file "${output_path}"
}

purge_workspaces() {
  assert_up
  kubectl_e2e --namespace "${E2E_RUNTIME_NAMESPACE}" delete pod,service,persistentvolumeclaim,secret \
    --selector 'vibecore.ai/workspace-id' \
    --ignore-not-found=true \
    --wait=true

  local remaining
  remaining="$(
    kubectl_e2e --namespace "${E2E_RUNTIME_NAMESPACE}" get pod,service,persistentvolumeclaim,secret \
      --selector 'vibecore.ai/workspace-id' \
      --ignore-not-found \
      --output name
  )"

  if [[ -n "${remaining}" ]]; then
    echo "runtime resources remain after purge: ${remaining}" >&2
    exit 1
  fi
}

down() {
  require_command kind

  if cluster_exists; then
    assert_owned_target
    kind delete cluster --name "${E2E_RUNTIME_CLUSTER_NAME}"
  elif [[ -e "$(owner_marker_path)" ]]; then
    # A failed create may leave only the marker. Still require the exact owner
    # before removing any runtime-specific local state.
    assert_owned_target
  elif [[ -e "${E2E_RUNTIME_KUBECONFIG}" ]]; then
    echo "refusing unowned E2E runtime kubeconfig: ${E2E_RUNTIME_KUBECONFIG}" >&2
    exit 1
  fi

  rm -f -- "${E2E_RUNTIME_KUBECONFIG}" "$(owner_marker_path)"

  assert_down
}

assert_down() {
  if cluster_exists; then
    echo "cluster still exists after teardown: ${E2E_RUNTIME_CLUSTER_NAME}" >&2
    exit 1
  fi

  if [[ -e "${E2E_RUNTIME_KUBECONFIG}" || -e "$(owner_marker_path)" ]]; then
    echo "runtime kubeconfig/ownership marker remains after teardown: ${E2E_RUNTIME_KUBECONFIG}" >&2
    exit 1
  fi

  printf '{"ok":true,"deletedCluster":"%s","verifiedAbsent":true}\n' "${E2E_RUNTIME_CLUSTER_NAME}"
}

validate_target

case "${1:-}" in
  up)
    up
    ;;
  assert-up)
    assert_up
    ;;
  assert-source)
    audited_sha="$(verified_source_sha)"
    printf '{"ok":true,"auditedSha":"%s","image":"%s"}\n' "${audited_sha}" "${E2E_RUNTIME_AGENT_IMAGE}"
    ;;
  evidence)
    evidence "${2:-runtime-e2e-evidence.json}"
    ;;
  purge-workspaces)
    purge_workspaces
    ;;
  down)
    down
    ;;
  assert-down)
    assert_down
    ;;
  *)
    echo 'usage: scripts/e2e-runtime-cluster.sh {up|assert-up|assert-source|evidence [path]|purge-workspaces|down|assert-down}' >&2
    exit 2
    ;;
esac
