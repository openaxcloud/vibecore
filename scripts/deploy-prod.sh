#!/usr/bin/env bash
# Manual production deploy with SHA-pinned image tags.
#
# Resolves the current HEAD short SHA, verifies the matching `sha-<short>`
# image tag exists in Artifact Registry for every required service, then
# runs `helm upgrade --install` with --set global.imageTag pinned to that
# SHA. Tail-logs the rolling update and runs the synthetic health probe.
#
# Usage:
#   ./scripts/deploy-prod.sh                      # deploy current main HEAD
#   ./scripts/deploy-prod.sh sha-abc1234          # deploy a specific tag
#   ./scripts/deploy-prod.sh --dry-run            # render the helm command only
#
# Prereqs:
#   - gcloud authenticated against vibecore-495216
#   - kubectl context pointing at vibecore-prod-app, namespace vibecore
#   - K8s Secret/vibecore-platform-secrets already present (see
#     scripts/sync-k8s-secret-from-gcp.sh)

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-vibecore-495216}"
REGION="${GCP_REGION:-europe-west9}"
REPO="${GAR_REPOSITORY:-vibecore-prod-containers}"
NAMESPACE="${NAMESPACE:-vibecore}"
RELEASE="${HELM_RELEASE:-vibecore}"
CHART_PATH="${CHART_PATH:-infra/helm/platform}"
VALUES_FILE="${VALUES_FILE:-infra/helm/platform/values-prod.yaml}"

IMAGES=(web admin api worker ai-gateway workspace-manager workspace-agent preview-proxy)

DRY_RUN=0
EXPLICIT_TAG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    sha-*|v*) EXPLICIT_TAG="$arg" ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# 1. Resolve target tag.
if [ -n "$EXPLICIT_TAG" ]; then
  TAG="$EXPLICIT_TAG"
else
  SHORT=$(git rev-parse --short HEAD)
  TAG="sha-${SHORT}"
fi

echo "== Target imageTag: $TAG =="

case "$TAG" in
  sha-[0-9a-f]*|v[0-9]*) ;;
  *) echo "Refusing to deploy: tag '$TAG' is not sha-<hex> or v<semver>." >&2; exit 1 ;;
esac

# 2. Verify every image has that tag in Artifact Registry.
echo "== Verifying images in ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO} =="
missing=()
for img in "${IMAGES[@]}"; do
  if gcloud artifacts docker images describe \
      "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${img}:${TAG}" \
      --project="$PROJECT_ID" --format="value(uri)" >/dev/null 2>&1; then
    echo "  ok:      ${img}:${TAG}"
  else
    echo "  MISSING: ${img}:${TAG}"
    missing+=("$img")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "Cannot deploy: ${#missing[@]} image(s) have no '${TAG}' tag in Artifact Registry."
  echo "Build them first via .github/workflows/docker.yml (push to product/saas-platform-production)"
  echo "or via ./build-and-push.sh, ensuring the SHA tag is published."
  exit 1
fi

# 3. Optionally record the current revision for rollback.
if [ "$DRY_RUN" = "0" ]; then
  echo
  echo "== Current helm history (rollback target candidates) =="
  helm history "$RELEASE" -n "$NAMESPACE" 2>/dev/null || echo "  (no prior revisions)"
fi

# 4. Run helm upgrade.
HELM_CMD=(
  helm upgrade --install "$RELEASE" "$CHART_PATH"
  --namespace "$NAMESPACE"
  --create-namespace
  --atomic
  --timeout 10m
  --values "$VALUES_FILE"
  --set "global.imageTag=$TAG"
)

echo
echo "== helm command =="
printf '  %s' "${HELM_CMD[0]}"
for arg in "${HELM_CMD[@]:1}"; do
  printf ' \\\n    %s' "$arg"
done
echo

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "--dry-run: not invoking helm."
  exit 0
fi

echo
echo "== Invoking helm =="
"${HELM_CMD[@]}"

# 5. Post-deploy: wait for pods and run synthetic health.
echo
echo "== Post-deploy: pod status =="
kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/part-of=vibecore

if command -v node >/dev/null 2>&1 && [ -f scripts/synthetic-health-check.mjs ]; then
  echo
  echo "== Synthetic health probe (app.e-code.ai) =="
  SYNTHETIC_BASE_URL="https://app.e-code.ai" node scripts/synthetic-health-check.mjs || {
    echo
    echo "Synthetic health probe failed. To rollback:"
    echo "  helm rollback $RELEASE <previous-revision> -n $NAMESPACE"
    exit 1
  }
fi

echo
echo "== Deploy of $TAG completed =="
