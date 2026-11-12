#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted ]]
[[ ${GITHUB_REF:-} == refs/heads/test/packages-main-runtime-20261112 ]]
[[ ${VIBECORE_CI_EPHEMERAL_RUNTIME:-} == 1 ]]
: "${PRODUCT_DIR:?}" "${HARNESS_DIR:?}" "${EVIDENCE_DIR:?}"
mkdir -p "$EVIDENCE_DIR" "$RUNNER_TEMP/packages-main-private"
chmod 700 "$RUNNER_TEMP/packages-main-private"
bash "$HARNESS_DIR/verify-product.sh"
# Keep secrets out of the source context, workflow artifacts and command arguments.
export KUBECONFIG="$RUNNER_TEMP/vibecore-runtime/kubeconfig"
export WORKSPACE_AGENT_TOKEN_SECRET=$(openssl rand -hex 32)
export WORKSPACE_MANAGER_SHARED_SECRET=$(openssl rand -hex 32)
export PREVIEW_PROXY_SHARED_SECRET=$(openssl rand -hex 32)
export JWT_SECRET=$(openssl rand -hex 32)
export COOKIE_SECRET=$(openssl rand -hex 32)
for key in WORKSPACE_AGENT_TOKEN_SECRET WORKSPACE_MANAGER_SHARED_SECRET PREVIEW_PROXY_SHARED_SECRET JWT_SECRET COOKIE_SECRET; do echo "::add-mask::${!key}"; done
export RUNTIME_BROWSER_OWNER=$(node -e 'console.log(require("crypto").randomUUID())')
export VIBECORE_CI_BROWSER_ISOLATION=1
export PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:18082/runtime-browser
export COMPOSE_PROJECT_NAME="packages-main-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
export WORKSPACE_AGENT_IMAGE="vibecore/workspace-agent:ci-05515deb61d2ff7a77c11243cb0d1bed58a08e69"
export PROOF_IMAGE="vibecore/packages-proof:05515de-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
export DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore REDIS_URL=redis://127.0.0.1:56379
export POSTGRES_PORT=55432 REDIS_PORT=56379
export RUNTIME_MODE=remote-kubernetes WORKSPACE_RUNTIME_NAMESPACE=workspaces WORKSPACE_STORAGE_CLASS=local-path
export WORKSPACE_MANAGER_URL=http://127.0.0.1:3010 WORKSPACE_AGENT_URL_TEMPLATE='http://127.0.0.1:18081/{workspaceId}'
export API_HOST=127.0.0.1 API_PORT=3001 API_BASE_URL=http://127.0.0.1:3001 SAAS_API_URL=http://127.0.0.1:3001
export API_CORS_ORIGINS=http://127.0.0.1:5173 PREVIEW_DOMAIN=localhost PREVIEW_PROXY_PORT=3020 PREVIEW_URL_TEMPLATE='http://{workspaceId}-{port}.localhost:3020/'
# The trap is active before provisioning, builds, containers or processes start.
pids=()
browser_attempted=false
phase=setup
cleanup() {
  result=$?; trap - EXIT INT TERM; set +e
  browser_status=0
  if [[ $browser_attempted == true ]]; then
    timeout 20s node "$HARNESS_DIR/upstream/runtime-browser-isolation.mjs" --stop-supervisor >/dev/null 2>&1 || browser_status=1
    timeout 20s node "$HARNESS_DIR/upstream/runtime-browser-isolation.mjs" --cleanup >/dev/null 2>&1 || browser_status=1
  fi
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null; done
  timeout --kill-after=2s 20s docker rm -f "packages-api-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" "packages-web-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" >/dev/null 2>&1
  if test -s "$KUBECONFIG"; then
    timeout --kill-after=2s 100s kubectl --kubeconfig "$KUBECONFIG" --request-timeout=10s delete namespace workspaces --timeout=90s >/dev/null 2>&1
    namespace_status=$?
  else namespace_status=0; fi
  compose_status=0
  if test -f "$RUNNER_TEMP/packages-main-private/empty.env"; then
    timeout --kill-after=2s 30s docker compose --env-file "$RUNNER_TEMP/packages-main-private/empty.env" -f "$PRODUCT_DIR/docker-compose.dev.yml" down -v >/dev/null 2>&1
    compose_status=$?
  fi
  # Only the k3s server from our explicit private kubeconfig. No saved contexts.
  timeout --kill-after=2s 20s sudo python3 "$HARNESS_DIR/stop-runtime.py" "$KUBECONFIG" "$HARNESS_DIR/upstream/k3s-runtime-bundle.json" >/dev/null 2>&1
  runtime_status=$?
  bash "$HARNESS_DIR/verify-product.sh" >/dev/null 2>&1
  immutable_status=$?
  printf '{"namespaceDeleteExit":%s,"composeDownExit":%s,"productVerificationExit":%s,"browserCleanupExit":%s,"runtimeStopExit":%s,"lastPhase":"%s","runExit":%s}\n' "$namespace_status" "$compose_status" "$immutable_status" "$browser_status" "$runtime_status" "$phase" "$result" > "$EVIDENCE_DIR/cleanup.json"
  rm -f "$RUNNER_TEMP/packages-main-private/container.env"
  find "$RUNNER_TEMP/vibecore-runtime/evidence" -maxdepth 1 -name 'runtime-browser-*.json' -exec cp {} "$EVIDENCE_DIR/" \; 2>/dev/null
  if [[ $namespace_status != 0 || $compose_status != 0 || $immutable_status != 0 || $browser_status != 0 || $runtime_status != 0 ]]; then result=1; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$PRODUCT_DIR"
phase=install
pnpm install --frozen-lockfile > "$RUNNER_TEMP/packages-main-private/install.log" 2>&1
ln -s "$PRODUCT_DIR/node_modules" "$HARNESS_DIR/node_modules"
python3 "$HARNESS_DIR/stop-runtime.checks.py"
node --test "$HARNESS_DIR/invariants.checks.mjs" "$HARNESS_DIR/upstream/runtime-agent-router.checks.mjs" "$HARNESS_DIR/upstream/runtime-browser-relay.checks.mjs"
# Exact product contracts include old-agent refusal/budget boundaries. They are
# unit/integration coverage, not a claim of an old binary exercised in Kubernetes.
node --test scripts/ci/package-dedicated-install.checks.mjs scripts/ci/package-transport.checks.mjs scripts/ci/package-install-import.checks.mjs
bash "$HARNESS_DIR/verify-product.sh"
context="$RUNNER_TEMP/packages-product-context"
mkdir "$context"
git archive 05515deb61d2ff7a77c11243cb0d1bed58a08e69 > "$RUNNER_TEMP/packages-main-private/product.tar"
tar -xf "$RUNNER_TEMP/packages-main-private/product.tar" -C "$context"
python3 - <<'PYPROOF'
import os,json,hashlib,subprocess
root=os.environ['PRODUCT_DIR']; archive=os.environ['RUNNER_TEMP']+'/packages-main-private/product.tar'
proof={'head':subprocess.check_output(['git','-C',root,'rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','-C',root,'rev-parse','HEAD^{tree}'],text=True).strip(),'archiveSha256':hashlib.sha256(open(archive,'rb').read()).hexdigest(),'productOverlay':False,'apiMode':'development (existing local CI topology)','webMode':'production build','packaging':'external validation Dockerfile; not release packaging'}
json.dump(proof,open(os.environ['EVIDENCE_DIR']+'/source.json','w'),indent=2)
PYPROOF
phase=build-images
docker build --label org.opencontainers.image.revision=05515deb61d2ff7a77c11243cb0d1bed58a08e69 -f "$context/services/workspace-agent/Dockerfile" -t "$WORKSPACE_AGENT_IMAGE" "$context" > "$RUNNER_TEMP/packages-main-private/agent-build.log" 2>&1
phase=build-images
docker build --label org.opencontainers.image.revision=05515deb61d2ff7a77c11243cb0d1bed58a08e69 -f "$HARNESS_DIR/Proof.Dockerfile" -t "$PROOF_IMAGE" "$context" > "$RUNNER_TEMP/packages-main-private/app-build.log" 2>&1
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$WORKSPACE_AGENT_IMAGE" "$PROOF_IMAGE" > "$EVIDENCE_DIR/image-identities.txt"
phase=provision
bash "$HARNESS_DIR/upstream/provision-runtime-kubernetes.sh" > "$RUNNER_TEMP/packages-main-private/provision.log" 2>&1
docker save "$WORKSPACE_AGENT_IMAGE" -o "$RUNNER_TEMP/vibecore-runtime/agent.tar"
sudo k3s ctr images import "$RUNNER_TEMP/vibecore-runtime/agent.tar" >/dev/null
rm "$RUNNER_TEMP/vibecore-runtime/agent.tar"
bash "$HARNESS_DIR/upstream/probe-runtime-gvisor.sh" > "$RUNNER_TEMP/packages-main-private/probe.log" 2>&1
cp "$RUNNER_TEMP/vibecore-runtime/evidence/versions.txt" "$EVIDENCE_DIR/versions.txt"
touch "$RUNNER_TEMP/packages-main-private/empty.env"
phase=dependencies
docker compose --env-file "$RUNNER_TEMP/packages-main-private/empty.env" -f docker-compose.dev.yml up -d --wait --wait-timeout 180 postgres redis mailpit > "$RUNNER_TEMP/packages-main-private/dependencies.log" 2>&1
phase=database
pnpm --filter @vibecore/database db:deploy > "$RUNNER_TEMP/packages-main-private/migrate.log" 2>&1
pnpm --filter @vibecore/database db:seed > "$RUNNER_TEMP/packages-main-private/seed.log" 2>&1
phase=services
setsid node "$HARNESS_DIR/router.mjs" > "$RUNNER_TEMP/packages-main-private/router.log" 2>&1 & pids+=("$!")
setsid pnpm --filter @vibecore/workspace-manager exec tsx src/server.ts > "$RUNNER_TEMP/packages-main-private/manager.log" 2>&1 & pids+=("$!")
setsid pnpm --filter @vibecore/preview-proxy exec tsx src/server.ts > "$RUNNER_TEMP/packages-main-private/preview.log" 2>&1 & pids+=("$!")
node "$HARNESS_DIR/wait-ready.mjs" tcp://127.0.0.1:18081 http://127.0.0.1:3010/health http://127.0.0.1:3020/health
# Explicit environment allowlist. No inherited provider/cloud credentials.
envfile="$RUNNER_TEMP/packages-main-private/container.env"
for key in JWT_SECRET COOKIE_SECRET DATABASE_URL REDIS_URL WORKSPACE_AGENT_IMAGE RUNTIME_MODE WORKSPACE_RUNTIME_NAMESPACE WORKSPACE_STORAGE_CLASS WORKSPACE_MANAGER_URL WORKSPACE_AGENT_URL_TEMPLATE WORKSPACE_AGENT_TOKEN_SECRET WORKSPACE_MANAGER_SHARED_SECRET PREVIEW_PROXY_SHARED_SECRET API_HOST API_PORT API_BASE_URL SAAS_API_URL API_CORS_ORIGINS PREVIEW_DOMAIN PREVIEW_PROXY_PORT PREVIEW_URL_TEMPLATE; do printf '%s=%s\n' "$key" "${!key}" >> "$envfile"; done
chmod 600 "$envfile"
docker run -d --name "packages-api-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --network host --cap-drop=ALL --security-opt=no-new-privileges --env-file "$envfile" -e NODE_ENV=development "$PROOF_IMAGE" pnpm --filter @vibecore/api exec tsx dist/server.js >/dev/null
docker run -d --name "packages-web-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --network host --cap-drop=ALL --security-opt=no-new-privileges --env-file "$envfile" -e HOST=127.0.0.1 -e PORT=5173 "$PROOF_IMAGE" >/dev/null
node "$HARNESS_DIR/wait-ready.mjs" http://127.0.0.1:3001/health http://127.0.0.1:5173
phase=browser
browser_attempted=true
printf '%s' "$RUNTIME_BROWSER_OWNER" > "$RUNNER_TEMP/packages-main-private/browser-owner"
setsid node "$HARNESS_DIR/upstream/runtime-browser-isolation.mjs" > "$RUNNER_TEMP/packages-main-private/browser.log" 2>&1 & pids+=("$!")
ready=false
for attempt in $(seq 1 120); do
  if test -f "$RUNNER_TEMP/runtime-browser-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/started"; then ready=true; break; fi
  kill -0 "${pids[-1]}"; sleep 2
done
[[ $ready == true ]]
phase=acceptance
timeout --kill-after=10s 16m node "$HARNESS_DIR/acceptance.mjs"
bash "$HARNESS_DIR/verify-product.sh"
