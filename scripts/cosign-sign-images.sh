#!/usr/bin/env bash
#
# Sign platform container images with the ecode-supply-chain cosign key (B7).
#
# Used by BOTH the Cloud Build pipelines (infra/cloudbuild/*.yaml) and the
# one-off retro-signing of already-deployed images, so there is exactly one
# definition of "how we sign" in the tree.
#
# Images are always signed BY DIGEST, never by tag: a tag is mutable, so
# signing `web:abc123` would attest to whatever that tag points at right now,
# and the guarantee would evaporate the moment the tag moved. Resolving to a
# digest first means the signature is bound to immutable content.
#
# --tlog-upload=false: we deliberately do NOT publish to the public Rekor
# transparency log. Two reasons: (1) it makes every build depend on
# sigstore.dev being reachable, turning a third-party outage into a failed
# production deploy; (2) verification is done offline against a static public
# key, so the log buys us nothing here. The Kyverno policy correspondingly sets
# rekor.ignoreTlog: true. These two settings MUST stay in sync.
#
# Usage:
#   COSIGN_KMS_KEY=gcpkms://... scripts/cosign-sign-images.sh REF [REF...]
#
# where REF is a full image reference with a tag or digest. Signing is
# idempotent: re-signing an already-signed digest simply adds/refreshes the
# signature layer, so re-running after a partial failure is safe.

set -euo pipefail

COSIGN_KMS_KEY="${COSIGN_KMS_KEY:-gcpkms://projects/vibecore-495216/locations/europe-west9/keyRings/ecode-supply-chain/cryptoKeys/cosign-images}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 REF [REF...]" >&2
  exit 2
fi

# Resolve a reference to its immutable digest form (repo@sha256:...).
resolve_digest() {
  local ref="$1"
  case "$ref" in
    *@sha256:*) printf '%s\n' "$ref"; return 0 ;;
  esac
  local repo digest
  repo="${ref%:*}"
  digest="$(gcloud artifacts docker images describe "$ref" \
    --format='value(image_summary.digest)' 2>/dev/null || true)"
  if [ -z "$digest" ]; then
    echo "ERROR: cannot resolve digest for ${ref}" >&2
    return 1
  fi
  printf '%s@%s\n' "$repo" "$digest"
}

# Deduplicate: several tags routinely point at the same digest (e.g. :latest and
# :<sha>), and every service tag in a given release shares one build. Signing
# the same digest repeatedly is harmless but slow and noisy.
#
# Uses a temp file rather than an associative array: this script also runs on
# macOS, whose /bin/bash is still 3.2 and has no `declare -A`.
queue="$(mktemp)"
trap 'rm -f "${queue}"' EXIT
failed=0

for ref in "$@"; do
  if ! canonical="$(resolve_digest "$ref")"; then
    failed=1
    continue
  fi
  if grep -qxF "${canonical}" "${queue}" 2>/dev/null; then
    echo "skip     ${ref} -> ${canonical} (already queued)"
  else
    printf '%s\n' "${canonical}" >> "${queue}"
    echo "resolved ${ref} -> ${canonical}"
  fi
done

count="$(wc -l < "${queue}" | tr -d ' ')"
if [ "${count}" -eq 0 ]; then
  echo "ERROR: nothing to sign" >&2
  exit 1
fi

echo
echo "signing ${count} unique digest(s) with ${COSIGN_KMS_KEY}"
while IFS= read -r canonical; do
  [ -n "${canonical}" ] || continue
  echo "--- sign ${canonical}"
  if ! cosign sign --key "${COSIGN_KMS_KEY}" --tlog-upload=false --yes "${canonical}"; then
    echo "ERROR: signing failed for ${canonical}" >&2
    failed=1
  fi
done < "${queue}"

if [ "$failed" -ne 0 ]; then
  echo "FAILED: at least one image could not be resolved or signed" >&2
  exit 1
fi

echo "OK: ${count} digest(s) signed"
