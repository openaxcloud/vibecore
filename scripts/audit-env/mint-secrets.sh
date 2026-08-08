#!/usr/bin/env bash
# Generates the platform secret for the audit test environment.
#
# GUARDRAIL: every value here is generated fresh on this machine. Nothing is
# read from the production project, from Secret Manager, or from any prod
# cluster. The third-party keys (Stripe, OAuth, LLM providers) are deliberately
# absent — see docs/audit/TEST_ENV_RUNBOOK.md for the scenarios that stay
# BLOCKED as a result.
set -euo pipefail

NS="${NS:-vibecore}"
SECRET_NAME="${SECRET_NAME:-vibecore-platform-secrets}"
TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infra/terraform/envs/audit-test" && pwd)"
OUT_DIR="${OUT_DIR:-$TF_DIR/credentials}"

ctx="$(kubectl config current-context)"
case "$ctx" in
  *vibecore-prod*) echo "REFUS: le contexte kubectl courant est la PROD ($ctx)." >&2; exit 1 ;;
esac
echo "==> contexte kubectl: $ctx"

rnd() { openssl rand -hex 32; }

DATABASE_URL="$(terraform -chdir="$TF_DIR" output -raw database_url)"
REDIS_URL="redis://vibecore-redis.${NS}.svc.cluster.local:6379"

# API_CORS_ORIGINS is NOT templated by the chart anywhere — in production it is
# provisioned out of band. The API is fail-closed on it: with NODE_ENV=production
# it refuses to boot unless this lists explicit HTTPS origins. So a from-scratch
# install has to supply it, which is exactly what this does.
LB_IP="${LB_IP:-$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)}"
API_CORS_ORIGINS="https://app.${LB_IP}.sslip.io,https://www.${LB_IP}.sslip.io,https://api.${LB_IP}.sslip.io"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
ENV_FILE="$OUT_DIR/audit-test.env"

cat > "$ENV_FILE" <<EOF
# Audit test environment — GENERATED TEST CREDENTIALS, not production.
# Regenerate at will: these protect nothing real and expire with the project.
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
JWT_SECRET=$(rnd)
COOKIE_SECRET=$(rnd)
CONFIG_ENCRYPTION_KEY=$(rnd)
WORKSPACE_AGENT_TOKEN_SECRET=$(rnd)
BACKUP_ENCRYPTION_KEY=$(rnd)
SIEM_SIGNING_SECRET=$(rnd)
PREVIEW_PROXY_SHARED_SECRET=$(rnd)
WORKSPACE_MANAGER_SHARED_SECRET=$(rnd)
EMAIL_HTTP_TOKEN=$(rnd)
API_CORS_ORIGINS=$API_CORS_ORIGINS
EOF
chmod 600 "$ENV_FILE"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" create secret generic "$SECRET_NAME" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> secret $NS/$SECRET_NAME applique ($(grep -c '=' "$ENV_FILE") cles)"
echo "==> valeurs en clair: $ENV_FILE (chmod 600, gitignore)"
