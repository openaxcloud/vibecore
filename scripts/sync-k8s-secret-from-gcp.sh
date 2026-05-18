#!/usr/bin/env bash
# Sync the K8s Secret/vibecore-platform-secrets from GCP Secret Manager.
#
# Pulls every vibecore-prod-* secret listed below, maps it to the env var
# name the platform expects, writes them into a transient env file, and
# applies the K8s Secret via `kubectl apply` (server-side merge). The temp
# file is shredded on exit so no plaintext secret ever lingers on disk.
#
# Usage:
#   ./scripts/sync-k8s-secret-from-gcp.sh                    # apply
#   ./scripts/sync-k8s-secret-from-gcp.sh --dry-run          # print yaml only
#   ./scripts/sync-k8s-secret-from-gcp.sh --restart          # apply + rolling-restart
#
# Prereqs:
#   - gcloud authenticated against vibecore-495216
#   - kubectl context pointing at vibecore-prod-app cluster, namespace vibecore
#
# Cluster auth refresh, if needed:
#   gcloud container clusters get-credentials vibecore-prod-app \
#     --region europe-west9 --project vibecore-495216
#   MY_IP=$(curl -s ifconfig.me)
#   gcloud container clusters update vibecore-prod-app \
#     --region europe-west9 --project vibecore-495216 \
#     --enable-master-authorized-networks \
#     --master-authorized-networks "${MY_IP}/32"

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-vibecore-495216}"
NAMESPACE="${NAMESPACE:-vibecore}"
SECRET_NAME="${SECRET_NAME:-vibecore-platform-secrets}"

DRY_RUN=0
RESTART=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --restart) RESTART=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ENV_VAR=secret-name pairs. Add new mappings here when secrets are created.
# Order matters only for the diff log — the env file is order-independent.
MAPPINGS=(
  "DATABASE_URL=vibecore-prod-database-url"
  "REDIS_URL=vibecore-prod-redis-url"
  "JWT_SECRET=vibecore-prod-jwt-secret"
  "COOKIE_SECRET=vibecore-prod-cookie-secret"
  "CONFIG_ENCRYPTION_KEY=vibecore-prod-encryption-key"
  "WORKSPACE_AGENT_TOKEN_SECRET=vibecore-prod-workspace-agent-token-secret"
  "BACKUP_ENCRYPTION_KEY=vibecore-prod-backup-encryption-key"
  "SIEM_SIGNING_SECRET=vibecore-prod-siem-signing-secret"
  "GOOGLE_CLIENT_ID=vibecore-prod-google-client-id"
  "GOOGLE_CLIENT_SECRET=vibecore-prod-google-client-secret"
  "GITHUB_CLIENT_ID=vibecore-prod-github-client-id"
  "GITHUB_CLIENT_SECRET=vibecore-prod-github-client-secret"
  "OPENAI_API_KEY=vibecore-prod-openai-api-key"
  "ANTHROPIC_API_KEY=vibecore-prod-anthropic-api-key"
  "GOOGLE_GEMINI_API_KEY=vibecore-prod-google-gemini-api-key"
  "XAI_API_KEY=vibecore-prod-xai-api-key"
  "MOONSHOT_API_KEY=vibecore-prod-moonshot-api-key"
  "STRIPE_SECRET_KEY=vibecore-prod-stripe-secret-key"
  "STRIPE_WEBHOOK_SECRET=vibecore-prod-stripe-webhook-secret"
  "SENTRY_DSN=vibecore-prod-sentry-dsn"
)

# Non-secret env values that belong in the same K8s Secret so every
# deployment that consumes vibecore-platform-secrets sees them.
STATIC_VALUES=(
  "NODE_ENV=production"
  "APP_ENV=production"
  "VITE_RUNTIME_MODE=remote-kubernetes"
  "VITE_RUNTIME_API_BASE_URL=https://workspace-manager.e-code.ai"
  "WORKSPACE_MANAGER_URL=https://workspace-manager.e-code.ai"
  "WORKSPACE_RUNTIME_NAMESPACE=workspaces"
  "LOG_REDACTION_ENABLED=true"
  "OTEL_SERVICE_NAME=vibecore-platform"
)

TMP_FILE=$(mktemp -t vibecore-secrets.XXXXXX)
chmod 600 "$TMP_FILE"
cleanup() {
  if command -v shred >/dev/null 2>&1; then
    shred -u "$TMP_FILE" 2>/dev/null || rm -f "$TMP_FILE"
  else
    rm -f "$TMP_FILE"
  fi
}
trap cleanup EXIT INT TERM

echo "== Pulling secrets from gcp project $PROJECT_ID =="
missing=()
present=0
for pair in "${MAPPINGS[@]}"; do
  env_var="${pair%%=*}"
  secret_name="${pair#*=}"
  value=$(gcloud secrets versions access latest \
    --secret="$secret_name" --project="$PROJECT_ID" 2>/dev/null || true)
  if [ -z "$value" ]; then
    missing+=("$env_var ($secret_name)")
    continue
  fi
  printf '%s=%s\n' "$env_var" "$value" >> "$TMP_FILE"
  present=$((present + 1))
done

for line in "${STATIC_VALUES[@]}"; do
  printf '%s\n' "$line" >> "$TMP_FILE"
done

echo "  pulled $present / ${#MAPPINGS[@]} secrets from Secret Manager"
echo "  + ${#STATIC_VALUES[@]} static config entries"
if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "  WARNING: ${#missing[@]} secret(s) had no enabled version:"
  for m in "${missing[@]}"; do
    echo "    - $m"
  done
  echo "  These env vars will not be set in the K8s Secret. Add them in"
  echo "  Secret Manager first if the platform needs them at boot."
fi

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "== --dry-run: keys that would be applied (values redacted) =="
  # We intentionally do NOT pipe `kubectl ... -o yaml` here: that would
  # print the secret values base64-encoded to stdout, which is NOT
  # encryption and leaks the secrets to the terminal scrollback,
  # CI logs, and any tee'd output.
  awk -F= '{ print "  " $1 " = [REDACTED " length($2) " bytes]" }' "$TMP_FILE" | sort
  echo
  echo "  To inspect the rendered Secret/yaml safely, run:"
  echo "    kubectl get secret $SECRET_NAME -n $NAMESPACE -o yaml"
  echo "  (against the live cluster, never the dry-run output)"
  exit 0
fi

echo
echo "== Applying Secret/$SECRET_NAME in namespace $NAMESPACE =="
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic "$SECRET_NAME" \
  --namespace="$NAMESPACE" \
  --from-env-file="$TMP_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "  applied."

if [ "$RESTART" = "1" ]; then
  echo
  echo "== Rolling-restart every deployment that mounts the secret =="
  kubectl rollout restart deployment \
    --namespace="$NAMESPACE" \
    --selector app.kubernetes.io/part-of=vibecore
  echo "  restart triggered. Watch with:"
  echo "    kubectl get pods -n $NAMESPACE -w"
fi
