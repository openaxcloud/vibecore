#!/usr/bin/env bash
# Last-resort idempotent runner cleanup after failure or cancellation.
set -u
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted ]] || exit 1
[[ ${GITHUB_REF:-} == refs/heads/test/packages-main-runtime-20261112 ]] || exit 1
export WORKSPACE_AGENT_IMAGE=vibecore/workspace-agent:ci-05515deb61d2ff7a77c11243cb0d1bed58a08e69
export VIBECORE_CI_BROWSER_ISOLATION=1
export PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:18082/runtime-browser
export KUBECONFIG="$RUNNER_TEMP/vibecore-runtime/kubeconfig"
export COMPOSE_PROJECT_NAME="packages-main-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
status=0
if [[ -f "$RUNNER_TEMP/packages-main-private/browser-owner" ]]; then
  export RUNTIME_BROWSER_OWNER=$(cat "$RUNNER_TEMP/packages-main-private/browser-owner")
  timeout 20s node "$HARNESS_DIR/upstream/runtime-browser-isolation.mjs" --stop-supervisor >/dev/null 2>&1 || status=1
  timeout 20s node "$HARNESS_DIR/upstream/runtime-browser-isolation.mjs" --cleanup >/dev/null 2>&1 || status=1
fi
# A terminated cluster already removed by the EXIT trap is not an error here.
if test -s "$KUBECONFIG" && timeout --kill-after=2s 7s kubectl --request-timeout=5s get namespace workspaces >/dev/null 2>&1; then
  timeout --kill-after=2s 100s kubectl --request-timeout=10s delete namespace workspaces --timeout=90s >/dev/null 2>&1 || status=1
fi
timeout --kill-after=2s 20s docker rm -f "packages-api-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" "packages-web-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" >/dev/null 2>&1 || true
if test -f "$RUNNER_TEMP/packages-main-private/empty.env"; then
  timeout --kill-after=2s 30s docker compose --env-file "$RUNNER_TEMP/packages-main-private/empty.env" -f "$PRODUCT_DIR/docker-compose.dev.yml" down -v >/dev/null 2>&1 || status=1
fi
timeout --kill-after=2s 20s sudo python3 "$HARNESS_DIR/stop-runtime.py" "$KUBECONFIG" "$HARNESS_DIR/upstream/k3s-runtime-bundle.json" >/dev/null 2>&1 || status=1
mkdir -p "$EVIDENCE_DIR"
printf '{"cleanupExit":%s}\n' "$status" > "$EVIDENCE_DIR/final-cleanup.json"
exit "$status"
