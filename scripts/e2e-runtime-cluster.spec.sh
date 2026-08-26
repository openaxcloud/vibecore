#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "${test_root}"' EXIT

mkdir -p "${test_root}/bin"
ln -s "${repo_root}/scripts/test-fixtures/e2e-runtime-fake-kind.sh" "${test_root}/bin/kind"
touch "${test_root}/clusters" "${test_root}/deletes"

export PATH="${test_root}/bin:${PATH}"
export KIND_FAKE_STATE_FILE="${test_root}/clusters"
export KIND_FAKE_DELETE_LOG="${test_root}/deletes"
export E2E_RUNTIME_CLUSTER_NAME='vibecore-e2e-runtime-test-123'
export E2E_RUNTIME_KUBECONFIG="${test_root}/vibecore-e2e-runtime-test.kubeconfig"
export E2E_RUNTIME_NAMESPACE='vibecore-e2e-runtime'

# The image tag, checked-out source and CI event SHA must be the same full SHA.
source_sha="$(git -C "${repo_root}" rev-parse HEAD)"
export E2E_RUNTIME_AGENT_IMAGE="vibecore/workspace-agent:e2e-${source_sha}"
export GITHUB_SHA="${source_sha}"
"${repo_root}/scripts/e2e-runtime-cluster.sh" assert-source >/dev/null

export GITHUB_SHA='1123456789abcdef0123456789abcdef01234567'
if "${repo_root}/scripts/e2e-runtime-cluster.sh" assert-source >/dev/null 2>&1; then
  echo 'source guard unexpectedly accepted a mismatched GitHub SHA' >&2
  exit 1
fi

export GITHUB_SHA="${source_sha}"
export E2E_RUNTIME_AGENT_IMAGE='vibecore/workspace-agent:e2e-2123456789abcdef0123456789abcdef01234567'
if "${repo_root}/scripts/e2e-runtime-cluster.sh" assert-source >/dev/null 2>&1; then
  echo 'source guard unexpectedly accepted a mismatched image tag' >&2
  exit 1
fi

export E2E_RUNTIME_AGENT_IMAGE="vibecore/workspace-agent:e2e-${source_sha}"

# An entirely absent target is a successful no-op.
"${repo_root}/scripts/e2e-runtime-cluster.sh" down >/dev/null
[[ ! -s "${KIND_FAKE_DELETE_LOG}" ]]

# Even without a cluster, a kubeconfig without the matching owner marker is not
# ours to delete merely because its basename looks plausible.
touch "${E2E_RUNTIME_KUBECONFIG}"
if "${repo_root}/scripts/e2e-runtime-cluster.sh" down >/dev/null 2>&1; then
  echo 'unowned kubeconfig deletion unexpectedly succeeded' >&2
  exit 1
fi
[[ -e "${E2E_RUNTIME_KUBECONFIG}" ]]
[[ ! -s "${KIND_FAKE_DELETE_LOG}" ]]

# A matching marker proves this runtime-specific local state is ours.
printf '%s\n' "${E2E_RUNTIME_CLUSTER_NAME}" >"${E2E_RUNTIME_KUBECONFIG}.owner"
"${repo_root}/scripts/e2e-runtime-cluster.sh" down >/dev/null
[[ ! -e "${E2E_RUNTIME_KUBECONFIG}" ]]
[[ ! -e "${E2E_RUNTIME_KUBECONFIG}.owner" ]]

# A matching cluster name without the owner marker is never enough authority to
# delete it.
printf '%s\n' "${E2E_RUNTIME_CLUSTER_NAME}" >"${KIND_FAKE_STATE_FILE}"
touch "${E2E_RUNTIME_KUBECONFIG}"
if "${repo_root}/scripts/e2e-runtime-cluster.sh" down >/dev/null 2>&1; then
  echo 'unowned cluster deletion unexpectedly succeeded' >&2
  exit 1
fi
[[ -e "${E2E_RUNTIME_KUBECONFIG}" ]]
[[ ! -s "${KIND_FAKE_DELETE_LOG}" ]]

# The exact owner marker authorizes exactly one named kind deletion. Both local
# identity files must disappear before assert-down succeeds.
printf '%s\n' "${E2E_RUNTIME_CLUSTER_NAME}" >"${E2E_RUNTIME_KUBECONFIG}.owner"
"${repo_root}/scripts/e2e-runtime-cluster.sh" down >/dev/null
[[ "$(<"${KIND_FAKE_DELETE_LOG}")" == "${E2E_RUNTIME_CLUSTER_NAME}" ]]
[[ ! -e "${E2E_RUNTIME_KUBECONFIG}" ]]
[[ ! -e "${E2E_RUNTIME_KUBECONFIG}.owner" ]]

echo 'E2E runtime cluster guard tests passed'
