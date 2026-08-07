#!/usr/bin/env bash
#
# Reproducible 3-case admission proof for the Cosign/Kyverno chain (PR #81).
#
# Demonstrates, against the ACTUAL policy engine and REAL cosign signatures:
#   * image signed with the trusted key  -> ADMITTED
#   * image with NO signature            -> REFUSED (required: true)
#   * image signed with a DIFFERENT key  -> REFUSED
# and that verification is bound to the image DIGEST, never a tag.
#
# It stays faithful to infra/supply-chain/kyverno-policy-verify-images.yaml:
# same engine settings (Cosign attestor, required:true, verifyDigest:false,
# rekor.ignoreTlog:true) — only the imageReferences glob (a throwaway local
# registry) and the public key (a throwaway local key, since the prod private
# half lives in Cloud KMS and never leaves it) differ. failureAction: Enforce
# here is the CANARY/local enforce proof; PROD stays Audit.
#
# TOOLS (pinned, obtain out-of-band; the script only references them):
#   * cosign v2.4.3  — the exact version the pipeline pins. darwin-arm64 sha256
#       edfc761b27ced77f0f9ca288ff4fac7caa898e1e9db38f4dfdf72160cdf8e638
#       (verified against v2.4.3 cosign_checksums.txt)
#   * kyverno CLI v1.13.4
#   * docker (any; used only for a local registry:2 and scratch image builds)
# Override paths via COSIGN=, KYVERNO=, else they must be on PATH.
set -euo pipefail

COSIGN="${COSIGN:-cosign}"
KYVERNO="${KYVERNO:-kyverno}"
REG_HOST="localhost:5001"
REG="${REG_HOST}/vibecore-prod-containers"
WORK="$(mktemp -d)"
export COSIGN_PASSWORD="" DOCKER_CLI_HINTS=false
trap 'docker rm -f b6b7-registry >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

echo "=================================================================="
echo " Cosign/Kyverno 3-case admission proof (B7 hardening, PR #81)"
echo " repo commit : $(git rev-parse HEAD 2>/dev/null || echo '<not in a git tree>')"
echo " cosign      : $($COSIGN version 2>/dev/null | awk -F': +' '/GitVersion/{print $2}')"
echo " kyverno CLI : $($KYVERNO version 2>/dev/null | awk -F': +' '/Version/{print $2; exit}')"
echo "=================================================================="

# --- throwaway local registry (localhost => cosign treats it as insecure http) -
docker rm -f b6b7-registry >/dev/null 2>&1 || true
docker run -d --name b6b7-registry -p 5001:5000 registry:2 >/dev/null
until curl -sf "http://${REG_HOST}/v2/" >/dev/null 2>&1; do sleep 1; done

# --- two key pairs: A = trusted platform key, B = an attacker's other key ------
( cd "$WORK" && $COSIGN generate-key-pair --output-key-prefix keyA >/dev/null 2>&1 )
( cd "$WORK" && $COSIGN generate-key-pair --output-key-prefix keyB >/dev/null 2>&1 )

# --- three tiny, DISTINCT images (distinct digests), pushed by digest ----------
# Digests are kept in a file, not a bash associative array: macOS ships bash 3.2
# (no `declare -A`), the same portability constraint scripts/cosign-sign-images.sh
# documents. `dg <case>` looks one up.
: > "$WORK/digests"
dg() { awk -v c="$1" '$1==c{print $2}' "$WORK/digests"; }
for c in signed unsigned otherkey; do
  echo "b6b7-$c" > "$WORK/payload-$c"
  printf 'FROM scratch\nCOPY payload-%s /case\n' "$c" > "$WORK/Dockerfile.$c"
  DOCKER_BUILDKIT=0 docker build -q -f "$WORK/Dockerfile.$c" -t "$REG/app-$c:v1" "$WORK" >/dev/null 2>&1
  docker push "$REG/app-$c:v1" >/dev/null
  echo "$c $(docker inspect --format='{{index .RepoDigests 0}}' "$REG/app-$c:v1")" >> "$WORK/digests"
done

# --- sign BY DIGEST (mirrors scripts/cosign-sign-images.sh: --tlog-upload=false)
$COSIGN sign --key "$WORK/keyA.key" --tlog-upload=false --yes "$(dg signed)"   >/dev/null 2>&1
$COSIGN sign --key "$WORK/keyB.key" --tlog-upload=false --yes "$(dg otherkey)" >/dev/null 2>&1
# 'unsigned' is deliberately left unsigned.

# --- build the local policy variants from the real policy's settings -----------
PUB="$(sed 's/^/                      /' "$WORK/keyA.pub")"
cat > "$WORK/policy-enforce.yaml" <<EOF
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-platform-image-signatures
spec:
  background: false
  webhookConfiguration:
    failurePolicy: Ignore
  rules:
    - name: cosign-verify-prod-containers
      match:
        any:
          - resources: { kinds: [Pod], namespaces: [vibecore] }
      verifyImages:
        - type: Cosign
          imageReferences: ["${REG}/*"]
          failureAction: Enforce
          required: true
          mutateDigest: false
          verifyDigest: false
          attestors:
            - count: 1
              entries:
                - keys:
                    publicKeys: |-
$PUB
                    signatureAlgorithm: sha256
                    rekor: { ignoreTlog: true }
EOF
sed 's/failureAction: Enforce/failureAction: Audit/' "$WORK/policy-enforce.yaml" > "$WORK/policy-audit.yaml"

pod() { cat > "$WORK/pod-$1.yaml" <<EOF
apiVersion: v1
kind: Pod
metadata: { name: app-$1, namespace: vibecore }
spec:
  containers: [{ name: app, image: $(dg "$1") }]
EOF
}
for c in signed unsigned otherkey; do pod "$c"; done

echo
echo "### Layer 1 — cosign verify against the trusted key, BY DIGEST"
echo "### (the exact cryptographic predicate Kyverno evaluates; proves digest-binding)"
for c in signed unsigned otherkey; do
  ref="$(dg "$c")"
  printf '  %-9s %s\n' "$c" "${ref#*/}"
  if $COSIGN verify --key "$WORK/keyA.pub" --insecure-ignore-tlog "$ref" >/dev/null 2>&1; then
    echo "            => signature VALID   => ADMIT"
  else
    echo "            => signature INVALID => REFUSE"
  fi
done

echo
echo "### Layer 2 — the ACTUAL Kyverno policy engine (failureAction: Enforce)"
# kyverno apply exits non-zero when a resource fails an Enforce policy — expected
# for the unsigned/other-key cases. Capture first, then report, so `set -e`/
# pipefail does not abort the run on those (intended) failures.
for c in signed unsigned otherkey; do
  echo "--- case '$c' ---"
  out="$($KYVERNO apply "$WORK/policy-enforce.yaml" --resource "$WORK/pod-$c.yaml" --registry 2>&1 || true)"
  printf '%s\n' "$out" | grep -E "pass:|failed to verify|unverified|no signatures" | sed 's/^/    /' || true
done

echo
echo "### Parity — same unsigned image under failureAction: Audit (PROD's phase)"
out="$($KYVERNO apply "$WORK/policy-audit.yaml" --resource "$WORK/pod-unsigned.yaml" --registry --audit-warn 2>&1 || true)"
printf '%s\n' "$out" | grep -E "pass:|audit warning" | sed 's/^/    /' || true
echo "    => Audit: warn only, Pod ADMITTED + PolicyReport. Enforce: Pod REFUSED."
echo
echo "DONE."
