#!/usr/bin/env bash
# Linux Docker host with runsc and Chromium. Pass the local Linux amd64 Go distribution directory.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
go_root=$(realpath "${1:?expected Go distribution directory}")
test -x "$go_root/bin/go"
image=node:22-bookworm@sha256:7c400d78797d8cbe3f6bb21d2227b86af4cd24b0014cc9f62ff989cc16de988e
docker image inspect "$image" >/dev/null
mounts=()
for dir in node_modules services/workspace-agent packages/{workspace-sdk,observability,runtime-contract,security}; do
  mounts+=(--mount "type=bind,src=$(realpath "$dir"),dst=/app/$dir,readonly")
done
network=$(docker network create --internal "language-preview-$(cat /proc/sys/kernel/random/uuid)")
container=
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi
  docker network rm "$network" >/dev/null
}
trap cleanup EXIT
for language in node python go; do
  key=$(cat /proc/sys/kernel/random/uuid)
  container=$(docker run -d --pull=never --runtime=runsc --network "$network" --cap-drop ALL \
    --read-only --user "$(id -u):$(id -g)" --tmpfs /tmp:exec,mode=1777 --tmpfs /workspace:exec,mode=1777 \
    "${mounts[@]}" --mount "type=bind,src=$go_root,dst=/opt/go,readonly" \
    -e WORKSPACE_ID=preview-test -e WORKSPACE_AGENT_TOKEN_SECRET="$key" \
    -e GOCACHE=/tmp/go-cache -e PATH=/opt/go/bin:/usr/local/bin:/usr/bin:/bin \
    -w /app/services/workspace-agent "$image" node --import tsx src/server.ts)
  address=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$container")
  PREVIEW_TEST_KEY="$key" node_modules/.bin/tsx tests/runtime/language-preview-browser.real.ts "$language" "http://$address:8080"
  docker rm -f "$container" >/dev/null
  container=
done
