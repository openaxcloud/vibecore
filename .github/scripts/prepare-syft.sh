#!/usr/bin/env bash
set -euo pipefail

# Cache layout consumed by @actions/tool-cache in the pinned anchore/sbom-action.
[[ "$(uname -sm)" == 'Linux x86_64' ]]
version=1.42.3
# Published archive digest and checksums manifest from anchore/syft v1.42.3.
digest=0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509
scratch=$(mktemp -d "${RUNNER_TEMP:?}/syft-install.XXXXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
archive="$scratch/release.tar.gz"
url="https://github.com/anchore/syft/releases/download/v$version/syft_${version}_linux_amd64.tar.gz"
# Retry transient transport failures only. A hash mismatch always fails immediately.
timeout --kill-after=5s 120s curl --disable --fail --silent --show-error --location \
  --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 45 \
  --retry 2 --retry-delay 2 --output "$archive" "$url"
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
tar -xOzf "$archive" syft > "$scratch/syft"
bin="${RUNNER_TOOL_CACHE:?}/syft/$version/x64"
install -D -m 0755 "$scratch/syft" "$bin/syft"
touch "$bin.complete"
printf 'version=v%s\n' "$version" >> "${GITHUB_OUTPUT:?}"
