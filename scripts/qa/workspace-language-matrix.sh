#!/usr/bin/env bash
# From a pnpm-installed checkout, supply unpacked Linux Go and Rust toolchains.
# Example: scripts/qa/workspace-language-matrix.sh /opt/go /opt/rust
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
go_root=$(realpath "${1:?provide the Go toolchain directory}")
rust_root=$(realpath "${2:?provide the Rust toolchain directory}")
test -x "$go_root/bin/go"
test -x "$rust_root/bin/rustc"
mounts=()
for dir in node_modules services/workspace-agent packages/{observability,runtime-contract,security,workspace-sdk}; do
  mounts+=(--mount "type=bind,src=$(realpath "$repo/$dir"),dst=/app/$dir,readonly")
done
docker run --rm --runtime=runsc --network=none --user "$(id -u):$(id -g)" \
  --read-only --tmpfs /tmp:exec,mode=1777 "${mounts[@]}" \
  --mount "type=bind,src=$go_root,dst=/opt/go,readonly" \
  --mount "type=bind,src=$rust_root,dst=/opt/rust,readonly" \
  -e PATH=/opt/go/bin:/opt/rust/bin:/usr/local/bin:/usr/bin:/bin \
  -e GOCACHE=/tmp/go-cache -w /app/services/workspace-agent \
  node:22-bookworm@sha256:7c400d78797d8cbe3f6bb21d2227b86af4cd24b0014cc9f62ff989cc16de988e node --import tsx language-matrix.ts
