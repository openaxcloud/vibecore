#!/usr/bin/env bash
#
# REPRODUCIBLE PROOF — "an authorised release deploys BY DIGEST, and the pods really
# run those digests".
#
# The release gate's refusal path can be proven against the live GitHub API (see
# scripts/release-gate/verify-required-checks.mjs and the release-gate-dryrun
# workflow). The *authorising* path ends in a production rollout, which cannot be
# demonstrated without deploying to production. This script proves the same
# mechanism against a real Kubernetes cluster that is not production:
#
#   1. builds seven DISTINCT images (different content per service, so every service
#      has a different digest — a cross-service digest mix-up would be detectable,
#      which pushing one image under seven names could not show)
#   2. pushes them to a throwaway OCI registry and reads back their real digests
#   3. `helm upgrade --install` the ACTUAL production chart with
#      `services.<svc>.imageDigest=<digest>` — no manifest editing, no test chart
#   4. asserts every rendered Deployment references `@sha256:…`, never a tag
#   5. waits for the rollout, then runs the SAME verification the deploy workflow
#      runs — `release-manifest.mjs verify-imageids` over the kubelet-reported
#      `.status.containerStatuses[].imageID` of the current ReplicaSet's pods
#   6. NEGATIVE CONTROL: rewrites the manifest with a wrong digest and asserts the
#      verification FAILS. Without this, step 5 passing proves only that the script
#      runs, not that it can detect a mismatch.
#   7. `--reuse-values` round trip: re-pins ONE service to a new digest and asserts the
#      others keep theirs. The production deploy always re-asserts only the digests it
#      resolved this run, so if the rest fell back to tags, a routine web-only deploy
#      would silently unpin every backend — with all checks still green.
#   8. BREAK-GLASS restore: re-applies the earlier manifest's digests exactly as
#      deploy-break-glass.yml does, and asserts the cluster returns to them. That is
#      requirement 8's mechanism; only its cosign step needs the production KMS key and
#      cannot run here.
#
# Usage:  bash scripts/release-gate/proof-digest-rollout.sh [--keep]
# Needs:  docker, kind, kubectl, helm, jq, node
#
set -euo pipefail

CLUSTER="${CLUSTER:-vc-gate-proof}"
REGISTRY_CONTAINER="${REGISTRY_CONTAINER:-vc-proof-registry}"
REGISTRY_HOST="${REGISTRY_HOST:-${REGISTRY_CONTAINER}:5000}"
REGISTRY_PUBLISH_PORT="${REGISTRY_PUBLISH_PORT:-5001}"
NS=vibecore
RELEASE=vibecore
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
CTX="kind-${CLUSTER}"

# valuesKey:imageName:containerPort
SERVICES=(
  "web:web:3000"
  "admin:admin:3000"
  "api:api:3001"
  "worker:worker:3002"
  "aiGateway:ai-gateway:3030"
  "workspaceManager:workspace-manager:3010"
  "previewProxy:preview-proxy:3020"
)

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
cleanup() {
  if [ "${KEEP}" -eq 1 ]; then
    echo "kept: cluster ${CLUSTER}, registry ${REGISTRY_CONTAINER}, workdir ${WORK}"
    return
  fi
  kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1 || true
  docker rm -f "${REGISTRY_CONTAINER}" >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
log "1/9  throwaway registry"
docker rm -f "${REGISTRY_CONTAINER}" >/dev/null 2>&1 || true
docker run -d --restart=no -p "${REGISTRY_PUBLISH_PORT}:5000" --name "${REGISTRY_CONTAINER}" registry:2 >/dev/null
for _ in $(seq 1 30); do curl -sf "http://localhost:${REGISTRY_PUBLISH_PORT}/v2/" >/dev/null && break; sleep 1; done
echo "registry up on localhost:${REGISTRY_PUBLISH_PORT}"

# ---------------------------------------------------------------------------
log "2/9  build seven DISTINCT images, read back their real digests"
: > "${WORK}/digests.txt"
for entry in "${SERVICES[@]}"; do
  key="${entry%%:*}"; rest="${entry#*:}"; image="${rest%%:*}"; port="${rest##*:}"
  d="${WORK}/img-${image}"; mkdir -p "$d/www"
  # Serve the chart's real probe paths so the pods actually become Ready — a proof
  # that stopped at "Running but never Ready" would skip the rollout wait entirely.
  #
  # busybox httpd, not nginx: the chart runs every container with
  # `readOnlyRootFilesystem: true` and `runAsNonRoot` (uid 1000), and nginx dies
  # immediately on that ("mkdir /var/cache/nginx/client_temp failed: Read-only file
  # system"). busybox httpd serves a static directory and writes nothing, so it
  # satisfies the chart's real hardening instead of forcing us to weaken it for the
  # proof — which would have made the proof about a chart we do not ship.
  printf '{"ok":true,"service":"%s"}' "${image}" > "$d/www/health"
  printf '{"ok":true,"service":"%s"}' "${image}" > "$d/www/ready"
  # Distinct content per service => distinct digest per service.
  printf 'vibecore-gate-proof service=%s port=%s\n' "${image}" "${port}" > "$d/www/index.html"
  cat > "$d/Dockerfile" <<EOF
FROM busybox:1.36
COPY www /www
ENTRYPOINT ["/bin/busybox", "httpd", "-f", "-v", "-p", "${port}", "-h", "/www"]
EOF
  docker build -q -t "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/${image}:proof" "$d" >/dev/null
  docker push -q "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/${image}:proof" >/dev/null
  digest="$(docker inspect --format='{{index .RepoDigests 0}}' "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/${image}:proof" | sed 's/.*@//')"
  echo "${image} ${digest}" >> "${WORK}/digests.txt"
  printf '  %-20s %s\n' "${image}" "${digest}"
done
distinct="$(awk '{print $2}' "${WORK}/digests.txt" | sort -u | wc -l | tr -d ' ')"
if [ "${distinct}" -ne "${#SERVICES[@]}" ]; then
  echo "FAIL: expected ${#SERVICES[@]} distinct digests, got ${distinct}" >&2
  exit 1
fi
echo "  ${distinct}/${#SERVICES[@]} digests are distinct"

# ---------------------------------------------------------------------------
log "3/9  kind cluster wired to that registry"
kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1 || true
kind create cluster --name "${CLUSTER}" --wait 180s >/dev/null
docker network connect kind "${REGISTRY_CONTAINER}" >/dev/null 2>&1 || true
NODE="${CLUSTER}-control-plane"
# containerd 2.x: the CRI registry config moved to the `io.containerd.cri.v1.images`
# plugin. Writing the 1.x `io.containerd.grpc.v1.cri` key instead does not merely get
# ignored — it makes containerd reject its config and `kubeadm init` fails, which is
# an extremely confusing way to learn about a TOML key.
docker exec "${NODE}" sh -c "mkdir -p '/etc/containerd/certs.d/${REGISTRY_HOST}' && cat > '/etc/containerd/certs.d/${REGISTRY_HOST}/hosts.toml' <<EOF
server = \"http://${REGISTRY_HOST}\"

[host.\"http://${REGISTRY_HOST}\"]
  capabilities = [\"pull\", \"resolve\"]
  skip_verify = true
EOF
grep -q 'io.containerd.cri.v1.images\".registry' /etc/containerd/config.toml || cat >> /etc/containerd/config.toml <<EOF

[plugins.\"io.containerd.cri.v1.images\".registry]
  config_path = \"/etc/containerd/certs.d\"
EOF
systemctl restart containerd"
sleep 8
docker exec "${NODE}" crictl pull "${REGISTRY_HOST}/vibecore/api:proof" >/dev/null
echo "  node pulls from ${REGISTRY_HOST}"

# ---------------------------------------------------------------------------
log "4/9  helm upgrade the REAL chart, every service pinned by digest"
# The chart RENDERS the namespace, but the platform secret has to exist before the
# first pod starts or `--atomic --wait` rolls the whole install back. So the
# namespace is created up front carrying Helm's ownership metadata — without it Helm
# refuses to adopt a namespace it did not create ("invalid ownership metadata").
kubectl --context "${CTX}" create namespace "${NS}" --dry-run=client -o yaml \
  | kubectl --context "${CTX}" label --local -f - -o yaml app.kubernetes.io/managed-by=Helm \
  | kubectl --context "${CTX}" annotate --local -f - -o yaml \
      "meta.helm.sh/release-name=${RELEASE}" "meta.helm.sh/release-namespace=${NS}" \
  | kubectl --context "${CTX}" apply -f - >/dev/null
kubectl --context "${CTX}" -n "${NS}" create secret generic vibecore-platform-secrets \
  --from-literal=DATABASE_URL=postgresql://proof:proof@127.0.0.1:5432/proof \
  --from-literal=REDIS_URL=redis://127.0.0.1:6379 \
  --dry-run=client -o yaml | kubectl --context "${CTX}" apply -f - >/dev/null

SETS=(
  --set "global.imageRegistry=${REGISTRY_HOST}/vibecore"
  --set global.dns01.enabled=false   # ClusterIssuer needs cert-manager CRDs
  --set migrations.enabled=false     # the migrations Job needs a real database
)
MANIFEST_SERVICES='[]'
for entry in "${SERVICES[@]}"; do
  key="${entry%%:*}"; rest="${entry#*:}"; image="${rest%%:*}"
  digest="$(awk -v i="${image}" '$1==i{print $2}' "${WORK}/digests.txt")"
  SETS+=(
    --set-string "services.${key}.imageDigest=${digest}"
    --set "services.${key}.replicas=1"
    --set "services.${key}.resources.requests.cpu=10m"
    --set "services.${key}.resources.requests.memory=32Mi"
    --set "services.${key}.resources.limits.cpu=200m"
    --set "services.${key}.resources.limits.memory=192Mi"
  )
  MANIFEST_SERVICES="$(printf '%s' "${MANIFEST_SERVICES}" | jq \
    --arg s "${key}" --arg i "${image}" --arg d "${digest}" \
    '. += [{service:$s, image:$i, digest:$d, rebuilt:true, cloudBuildId:"proof-local",
            signature:{verified:true, key:"proof-local"}}]')"
done

# Assert the RENDER first: if the chart emitted a tag anywhere, the rollout below
# would "pass" while proving nothing about digests.
helm --kube-context "${CTX}" template "${RELEASE}" "${REPO_ROOT}/infra/helm/platform" \
  -n "${NS}" "${SETS[@]}" > "${WORK}/rendered.yaml"
tagged="$(grep -E '^\s+image: ' "${WORK}/rendered.yaml" | grep -v '@sha256:' || true)"
if [ -n "${tagged}" ]; then
  echo "FAIL: chart rendered non-digest image references:" >&2
  printf '%s\n' "${tagged}" >&2
  exit 1
fi
echo "  every rendered image reference is @sha256:… ($(grep -cE '^\s+image: .*@sha256:' "${WORK}/rendered.yaml") containers)"

helm --kube-context "${CTX}" upgrade --install "${RELEASE}" "${REPO_ROOT}/infra/helm/platform" \
  -n "${NS}" "${SETS[@]}" --atomic --timeout 8m >/dev/null
echo "  helm upgrade --atomic completed"

# ---------------------------------------------------------------------------
log "5/9  the SAME post-rollout verification the deploy workflow runs"
jq -n --argjson services "${MANIFEST_SERVICES}" \
  '{schemaVersion:1, targetSha:"'"$(printf 'f%.0s' {1..40})"'", registry:"proof",
    services:$services}' > "${WORK}/manifest-input.json"
node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" build \
  --input "${WORK}/manifest-input.json" --out "${WORK}/manifest.json" >/dev/null
echo "  manifest built and validated"

collect_observed() {
  echo '{}' > "${WORK}/observed.json"
  for entry in "${SERVICES[@]}"; do
    key="${entry%%:*}"; rest="${entry#*:}"; image="${rest%%:*}"
    dep="$(kubectl --context "${CTX}" -n "${NS}" get deploy -l "app.kubernetes.io/name=${image}" -o name 2>/dev/null | head -n1)"
    [ -n "${dep}" ] || dep="deploy/${RELEASE}-vibecore-platform-${image}"
    # `kubectl get -o name` prints `deployment.apps/<name>`, not `deploy/<name>`.
    depname="${dep##*/}"
    kubectl --context "${CTX}" -n "${NS}" rollout status "${dep}" --timeout=5m >/dev/null
    # Active ReplicaSet = the one at the Deployment's CURRENT revision. A restore
    # reuses an earlier ReplicaSet, so "newest by creationTimestamp" points at the one
    # that was just scaled to zero. Step 8 caught exactly that.
    rev="$(kubectl --context "${CTX}" -n "${NS}" get deploy "${depname}" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')"
    hash="$(kubectl --context "${CTX}" -n "${NS}" get rs -o json | jq -r --arg d "${depname}" --arg rev "${rev}" \
      '[ .items[] | select((.metadata.ownerReferences // [])[]?.name == $d) | select(.metadata.annotations["deployment.kubernetes.io/revision"] == $rev) ] | first | .metadata.labels["pod-template-hash"] // ""')"
    if [ -z "${hash}" ]; then
      echo "FAIL: could not find the current ReplicaSet for ${depname}" >&2
      exit 1
    fi
    ids="$(kubectl --context "${CTX}" -n "${NS}" get pods \
      -l "app.kubernetes.io/name=${image},pod-template-hash=${hash}" -o json \
      | jq -c --arg img "${image}" '[ .items[] | select(.metadata.deletionTimestamp == null) | select(.status.phase == "Running") | .status.containerStatuses[]? | select(.name == $img) | .imageID ]')"
    jq --arg s "${key}" --argjson ids "${ids}" '. + {($s): $ids}' "${WORK}/observed.json" > "${WORK}/observed.next"
    mv "${WORK}/observed.next" "${WORK}/observed.json"
  done
}
collect_observed
jq . "${WORK}/observed.json"
node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
  --manifest "${WORK}/manifest.json" --observed "${WORK}/observed.json"

# ---------------------------------------------------------------------------
log "6/9  NEGATIVE CONTROL — a wrong digest must be caught"
jq '.services[0].digest = "sha256:'"$(printf '0%.0s' {1..64})"'"' "${WORK}/manifest.json" > "${WORK}/manifest-tampered.json"
if node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
     --manifest "${WORK}/manifest-tampered.json" --observed "${WORK}/observed.json" >/dev/null 2>&1; then
  echo "FAIL: verification accepted a manifest whose digest does not match the running pod" >&2
  exit 1
fi
echo "  a mismatched digest is rejected (verification can actually fail)"

# ---------------------------------------------------------------------------
log "7/9  --reuse-values round trip — a partial upgrade must not unpin the rest"
#
# The production deploy always runs `helm upgrade --reuse-values` and only re-asserts
# the digests it resolved this run. The whole design rests on an assumption that has
# never been tested: that the services NOT re-set keep their PINNED DIGEST, rather than
# falling back to a tag. If they fell back, a routine web-only deploy would silently
# unpin every backend service while every check stayed green.
docker build -q -t "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/api:proof2" - >/dev/null <<'EOF'
FROM busybox:1.36
RUN mkdir -p /www && printf '{"ok":true,"service":"api","rev":2}' > /www/health \
  && cp /www/health /www/ready && printf 'rev2\n' > /www/index.html
ENTRYPOINT ["/bin/busybox", "httpd", "-f", "-v", "-p", "3001", "-h", "/www"]
EOF
docker push -q "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/api:proof2" >/dev/null
API_DIGEST_2="$(docker inspect --format='{{index .RepoDigests 0}}' \
  "localhost:${REGISTRY_PUBLISH_PORT}/vibecore/api:proof2" | sed 's/.*@//')"
API_DIGEST_1="$(awk '$1=="api"{print $2}' "${WORK}/digests.txt")"
if [ "${API_DIGEST_1}" = "${API_DIGEST_2}" ]; then
  echo "FAIL: the second api image has the same digest — the test cannot detect a change" >&2
  exit 1
fi
echo "  api: ${API_DIGEST_1} -> ${API_DIGEST_2}"

helm --kube-context "${CTX}" upgrade "${RELEASE}" "${REPO_ROOT}/infra/helm/platform" \
  -n "${NS}" --reuse-values --atomic --timeout 8m \
  --set-string "services.api.imageDigest=${API_DIGEST_2}" >/dev/null

collect_observed
# api moved; everything else must still be on its ORIGINAL digest.
jq --arg d "${API_DIGEST_2}" '(.services[] | select(.service == "api") | .digest) |= $d' \
  "${WORK}/manifest.json" > "${WORK}/manifest-rev2.json"
node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
  --manifest "${WORK}/manifest-rev2.json" --observed "${WORK}/observed.json"
# And prove it is still a DIGEST reference, not a tag that happens to resolve.
untagged="$(kubectl --context "${CTX}" -n "${NS}" get deploy -o json \
  | jq -r '[ .items[].spec.template.spec.containers[].image | select(contains("@sha256:") | not) ] | join(", ")')"
if [ -n "${untagged}" ]; then
  echo "FAIL: --reuse-values left these images unpinned: ${untagged}" >&2
  exit 1
fi
echo "  every other service kept its pinned digest through a partial upgrade"

# ---------------------------------------------------------------------------
log "8/9  BREAK-GLASS restore — a last-known-good manifest puts the cluster back"
#
# Exercises requirement 8's actual mechanism: take the manifest recorded by the earlier
# (good) release and re-apply exactly what deploy-break-glass.yml applies — the digests
# of chart services, nothing else, no build. The cosign verification in the real job
# needs the production KMS key and cannot run here; everything downstream of it can.
BG_SETS=()
while read -r service digest; do
  BG_SETS+=( --set-string "services.${service}.imageDigest=${digest}" )
done < <(jq -r '.services[] | select(.chartService != false) | "\(.service) \(.digest)"' "${WORK}/manifest.json")
echo "  restoring $(( ${#BG_SETS[@]} / 2 )) digest pin(s) from the last-known-good manifest"

helm --kube-context "${CTX}" upgrade "${RELEASE}" "${REPO_ROOT}/infra/helm/platform" \
  -n "${NS}" --reuse-values --atomic --timeout 8m "${BG_SETS[@]}" >/dev/null

collect_observed
node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
  --manifest "${WORK}/manifest.json" --observed "${WORK}/observed.json"
echo "  the cluster is back on every digest the last-known-good manifest names"

# ---------------------------------------------------------------------------
log "9/9  ROLLBACK is EXERCISED after a post-rollout check failure"
#
# `--atomic` only reverts an upgrade that failed on its own terms. Everything the
# deploy verifies AFTERWARDS — imageIDs matching the manifest, the rollback flag
# surviving — runs against a release that is already live. This step proves the
# workflow's answer to that window actually works, rather than asserting it in prose:
# deploy something that passes helm but FAILS verification, confirm the check fails,
# run the same `helm rollback <previous revision>` the workflow runs, and confirm the
# cluster is verified again.
GOOD_REV="$(helm --kube-context "${CTX}" -n "${NS}" history "${RELEASE}" -o json \
  | jq -r '[.[] | select(.status == "deployed")] | last | .revision')"
echo "  verified revision to return to: ${GOOD_REV}"

# A rollout helm is happy with, but that the manifest does not describe.
helm --kube-context "${CTX}" upgrade "${RELEASE}" "${REPO_ROOT}/infra/helm/platform" \
  -n "${NS}" --reuse-values --atomic --timeout 8m \
  --set-string "services.api.imageDigest=${API_DIGEST_2}" >/dev/null
echo "  applied a release the manifest does not describe (api on ${API_DIGEST_2})"

collect_observed
if node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
     --manifest "${WORK}/manifest.json" --observed "${WORK}/observed.json" >/dev/null 2>&1; then
  echo "FAIL: post-rollout verification passed on a release it should have rejected" >&2
  exit 1
fi
echo "  post-rollout verification FAILED, as it must"

helm --kube-context "${CTX}" -n "${NS}" rollback "${RELEASE}" "${GOOD_REV}" --wait --timeout 10m >/dev/null
echo "  helm rollback ${GOOD_REV} applied"

collect_observed
node "${REPO_ROOT}/scripts/release-gate/release-manifest.mjs" verify-imageids \
  --manifest "${WORK}/manifest.json" --observed "${WORK}/observed.json"
echo "  production state is verified again after the rollback"

printf '\n\033[1;32mPROOF COMPLETE\033[0m — deployed by digest on a real cluster; running imageIDs match the manifest; a wrong digest is detected; a partial --reuse-values upgrade leaves the other services pinned; a last-known-good manifest restores them; and a post-check failure is ROLLED BACK to the last verified revision.\n'
