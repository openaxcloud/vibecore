#!/usr/bin/env bash
set -euo pipefail
# Dedicated disposable GitHub-hosted runner only. Never use a saved kube context.
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted ]]
[[ ${VIBECORE_CI_EPHEMERAL_RUNTIME:-} == 1 ]]
[[ ${KUBECONFIG:-} == "$RUNNER_TEMP/vibecore-runtime/kubeconfig" ]]
[[ ! -e "$KUBECONFIG" ]]
root="$RUNNER_TEMP/vibecore-runtime"
mkdir -p "$root/downloads" "$root/evidence"
chmod 700 "$root"
cd "$root/downloads"

# Official, versioned releases; verify each download against its release checksum.
k3s_version='v1.37.2+k3s1'
gvisor_version='release-20261102.0'
curl --fail --location --retry 3 "https://github.com/k3s-io/k3s/releases/download/${k3s_version}/k3s" -o k3s
curl --fail --location --retry 3 "https://github.com/k3s-io/k3s/releases/download/${k3s_version}/sha256sum-amd64.txt" -o k3s-checksums
awk '$2 == "k3s" || $2 == "./k3s" { print }' k3s-checksums > k3s.sha256
[[ $(wc -l < k3s.sha256) -eq 1 ]]
sha256sum --check k3s.sha256
printf '%s  k3s\n' '265b3ee6a3198ef14033c63ef46cbb32370d83795199fb6d1b01f21575eddbda' | sha256sum --check -
curl --fail --location --retry 3 "https://github.com/google/gvisor/releases/download/${gvisor_version}/gvisor-x86_64.tar.bz2" -o gvisor-x86_64.tar.bz2
curl --fail --location --retry 3 "https://github.com/google/gvisor/releases/download/${gvisor_version}/SHA256SUMS" -o gvisor-checksums
awk '$2 == "gvisor-x86_64.tar.bz2" || $2 == "./gvisor-x86_64.tar.bz2" { print }' gvisor-checksums > gvisor.sha256
[[ $(wc -l < gvisor.sha256) -eq 1 ]]
sha256sum --check gvisor.sha256
printf '%s  gvisor-x86_64.tar.bz2\n' '6f6b1a8f0f4665a403238135167d0d990bfaeaff5544abf68f5e0d822b35484a' | sha256sum --check -
mkdir gvisor
tar -xjf gvisor-x86_64.tar.bz2 -C gvisor
for binary in runsc containerd-shim-runsc-v1; do
  mapfile -t matches < <(find gvisor -type f -name "$binary")
  [[ ${#matches[@]} -eq 1 ]]
  sudo install -m 0755 "${matches[0]}" "/usr/local/bin/$binary"
done
sudo install -m 0755 k3s /usr/local/bin/k3s
sudo ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl
sudo mkdir -p /var/lib/rancher/k3s/agent/etc/containerd /etc/containerd
sudo tee /etc/containerd/vibecore-runsc.toml >/dev/null <<'TOML'
[runsc_config]
  platform = "systrap"
TOML
sudo tee /var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.tmpl >/dev/null <<'TOML'
{{ template "base" . }}
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.gvisor]
  runtime_type = "io.containerd.runsc.v1"
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.gvisor.options]
  TypeUrl = "io.containerd.runsc.v1.options"
  ConfigPath = "/etc/containerd/vibecore-runsc.toml"
TOML
sudo nohup /usr/local/bin/k3s server --disable traefik --disable servicelb \
  --write-kubeconfig "$KUBECONFIG" --write-kubeconfig-mode 600 \
  > "$root/k3s.log" 2>&1 &
for attempt in $(seq 1 120); do
  if sudo test -s "$KUBECONFIG"; then
    sudo chown "$(id -u):$(id -g)" "$KUBECONFIG"
    if [[ -n "$(kubectl get nodes -o name 2>/dev/null)" ]]; then break; fi
  fi
  sleep 2
done
kubectl wait --for=condition=Ready nodes --all --timeout=180s
kubectl label nodes --all vibecore.ai/node-pool=sandbox
kubectl create namespace workspaces
kubectl apply -f - <<'YAML'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: gvisor
YAML
kubectl -n kube-system wait --for=create deployment/local-path-provisioner --timeout=180s
kubectl -n kube-system rollout status deployment/local-path-provisioner --timeout=180s
printf 'k3s=%s\ngvisor=%s\n' "$k3s_version" "$gvisor_version" > "$root/evidence/versions.txt"
cat k3s.sha256 gvisor.sha256 >> "$root/evidence/versions.txt"
runsc --version >> "$root/evidence/versions.txt"
kubectl version -o json > "$root/evidence/kubernetes-version.json"
