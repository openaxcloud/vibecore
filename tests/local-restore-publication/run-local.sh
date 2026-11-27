#!/usr/bin/env bash
# Requires a disposable checkout, installed dependencies, Chromium, and cached Docker images.
set -euo pipefail
if [[ ${1:-} != --isolated-env ]]; then
  exec env -i PATH="$PATH" HOME=/nonexistent PLAYWRIGHT_CHROMIUM_EXECUTABLE="${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-/usr/bin/chromium}" bash "$0" --isolated-env
fi
cd "$(dirname "$0")/../.."
bench=$(mktemp -d)
export HOME="$bench/home"
mkdir "$HOME"
children=()
containers=()
cleanup() {
  for child in "${children[@]}"; do kill -- "-$child" 2>/dev/null || true; done
  for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null; done
  rm -rf "$bench"
}
trap cleanup EXIT
start() {
  local name=$1
  shift
  setsid "$@" >"$bench/$name.log" 2>&1 &
  children+=("$!")
}
export DATABASE_URL=postgresql://vibecore:localtest@127.0.0.1:58437/vibecore REDIS_URL=redis://127.0.0.1:58379
export API_HOST=127.0.0.1 API_PORT=4937 API_BASE_URL=http://127.0.0.1:4937 SAAS_API_URL=http://127.0.0.1:4937 API_INTERNAL_URL=http://127.0.0.1:4937 API_CORS_ORIGINS=http://127.0.0.1:6937
export JWT_SECRET=synthetic-launch-audit-0123456789 WORKSPACE_AGENT_TOKEN_SECRET=synthetic-launch-agent-0123456789 WORKSPACE_MANAGER_SHARED_SECRET=synthetic-launch-manager-0123456789 PREVIEW_PROXY_SHARED_SECRET=synthetic-launch-preview-0123456789
export WORKSPACE_MANAGER_URL=http://127.0.0.1:4938 WORKSPACE_AGENT_URL_TEMPLATE=http://127.0.0.1:4939 WORKSPACE_MANAGER_PORT=4938 WORKSPACE_MANAGER_STORE=json WORKSPACE_MANAGER_STORE_PATH="$bench/store.json"
export RUNTIME_MODE=remote-kubernetes VITE_RUNTIME_MODE=remote-kubernetes WORKSPACE_LOCAL_RUNTIME_FALLBACK=1 RUNTIME_API_BASE_URL=http://127.0.0.1:4937/api/runtime VITE_RUNTIME_API_BASE_URL=http://127.0.0.1:4937/api/runtime
export PREVIEW_DOMAIN=localhost:4020 PLAYWRIGHT_BASE_URL=http://127.0.0.1:6937 KUBECTL_BIN="$PWD/tests/local-restore-publication/kubectl-fixture.sh"
export WORKSPACE_ROOT="$bench/work" NPM_CONFIG_CACHE="$bench/npm" NPM_CONFIG_OFFLINE=true
mkdir "$WORKSPACE_ROOT"
for port in 4937 4938 4939 6937 58437 58379 4020; do
  if (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then echo "Loopback port occupied: $port" >&2; exit 1; fi
done
db=$(docker run --pull=never --rm -d -p 127.0.0.1:58437:5432 -e POSTGRES_USER=vibecore -e POSTGRES_PASSWORD=localtest -e POSTGRES_DB=vibecore pgvector/pgvector:pg16)
containers+=("$db")
redis=$(docker run --pull=never --rm -d -p 127.0.0.1:58379:6379 redis:7-alpine)
containers+=("$redis")
timeout 60 bash -c 'until docker exec "$1" pg_isready -U vibecore >/dev/null; do sleep 1; done' _ "$db"
(cd packages/database && node_modules/.bin/prisma migrate deploy)
for service in api worker; do
  entry=server
  if [[ $service == worker ]]; then entry=index; fi
  start "$service" bash -c 'cd "services/$1" && exec node_modules/.bin/tsx "src/$2.ts"' _ "$service" "$entry"
done
export RESTORE_TLS_DIR="$bench/tls"
mkdir -p "$RESTORE_TLS_DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext 'subjectAltName=DNS:*.localhost' -keyout "$RESTORE_TLS_DIR/key.pem" -out "$RESTORE_TLS_DIR/cert.pem" 2>/dev/null
RESTORE_TLS_SPKI=$(openssl x509 -in "$RESTORE_TLS_DIR/cert.pem" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64 -A)
export RESTORE_TLS_SPKI
start route node_modules/.bin/tsx tests/local-restore-publication/route.ts
start manager node_modules/.bin/tsx tests/local-restore-publication/manager.ts
start agent env HOST=127.0.0.1 PORT=4939 bash -c 'cd services/workspace-agent && exec node_modules/.bin/tsx src/server.ts'
NODE_OPTIONS=--max-old-space-size=6656 node_modules/.bin/react-router build
start web env HOST=127.0.0.1 PORT=6937 NODE_ENV=production node_modules/.bin/react-router-serve build/server/index.js
for url in "$SAAS_API_URL/health" "$PLAYWRIGHT_BASE_URL/" http://127.0.0.1:4939/health http://127.0.0.1:4938/health; do
  timeout 90 bash -c 'until curl -fsS "$1" >/dev/null 2>&1; do sleep 1; done' _ "$url"
done
PLAYWRIGHT_CHROMIUM_EXECUTABLE="${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-/usr/bin/chromium}" node_modules/.bin/tsx tests/local-restore-publication/check.ts
