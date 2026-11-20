#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$RUNNER_TEMP/private-runtime-bin"
pushd "$RUNNER_TEMP/private-runtime-bin"
curl -fsSLo kind https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64
curl -fsSLo kind.sha256 https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64.sha256sum
echo "$(cut -d ' ' -f 1 kind.sha256)  kind" | sha256sum -c -
curl -fsSLo kubectl https://dl.k8s.io/release/v1.34.0/bin/linux/amd64/kubectl
curl -fsSLo kubectl.sha256 https://dl.k8s.io/release/v1.34.0/bin/linux/amd64/kubectl.sha256
 echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c -
chmod 0755 kind kubectl
popd
pnpm exec playwright install --with-deps chromium
