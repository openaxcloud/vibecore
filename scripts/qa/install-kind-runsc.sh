#!/usr/bin/env bash
set -euo pipefail
# Called after verifying the locally generated kind node and kubeconfig.
node=$1
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cd "$dir"
for bin in runsc containerd-shim-runsc-v1; do
  curl --fail --silent --show-error --location --max-time 120 -o "$bin" "https://storage.googleapis.com/gvisor/releases/release/20260413.0/x86_64/$bin"
done
sha512sum -c <<'SUMS'
12f98f1305ea883a5cf68d158877b26e011348100211fa65cc01f91af25d6777ddf84893a4945dceb133346a5e045719d98da353fdc30d67e9f697f2483cf8d0  runsc
48f388ee9ac5d71181ae65e3b8a9076d95e6dfc0a74d0037c5a11ec2225622cfd154231868d7d09e999f10a2f09e96e6eb4228f10e0bab1d1da235703238a7c0  containerd-shim-runsc-v1
SUMS
for bin in runsc containerd-shim-runsc-v1; do
  chmod 0755 "$bin"
  docker cp "$bin" "$node:/usr/local/bin/$bin"
done
docker exec "$node" systemctl restart containerd
