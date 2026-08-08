#!/usr/bin/env bash
# Substitutes the two runtime-discovered values into the audit overlay:
#   __LB_IP__    the ingress-nginx external IP (drives every sslip.io hostname)
#   __SQL_CIDR__ the Private Service Access range Cloud SQL sits in; the
#                NetworkPolicy egress allow-list is fail-closed on it.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Overridable for the same reason as in mint-secrets.sh: the Terraform state may
# live outside the checkout this script runs from.
TF_DIR="${TF_DIR:-$REPO/infra/terraform/envs/audit-test}"
SRC="$REPO/infra/helm/platform/values-audit-test.yaml"
OUT="${OUT:-$TF_DIR/credentials/values-audit-test.rendered.yaml}"

LB_IP="${LB_IP:-$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')}"
[[ -n "$LB_IP" ]] || { echo "!! LB_IP introuvable" >&2; exit 1; }

SQL_IP="$(terraform -chdir="$TF_DIR" output -raw postgres_private_ip)"
# PSA range is a /16 handed out by Google; derive it from the instance IP.
SQL_CIDR="$(printf '%s' "$SQL_IP" | awk -F. '{print $1"."$2".0.0/16"}')"

mkdir -p "$(dirname "$OUT")"
sed -e "s|__LB_IP__|$LB_IP|g" -e "s|__SQL_CIDR__|$SQL_CIDR|g" "$SRC" > "$OUT"

echo "==> LB_IP=$LB_IP"
echo "==> SQL_IP=$SQL_IP -> postgresCidr=$SQL_CIDR"
echo "==> rendu: $OUT"
grep -n "sslip.io\|postgresCidr" "$OUT" | head -20
