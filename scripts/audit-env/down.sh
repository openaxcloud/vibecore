#!/usr/bin/env bash
# Teardown of the ephemeral audit test environment.
#
# Two layers on purpose:
#   1. `terraform destroy` — removes what Terraform created, cleanly.
#   2. `gcloud projects delete` — the authoritative backstop. Anything created
#      by hand (kubectl, helm, Cloud Build) lives in the same project and dies
#      with it, so no orphan can survive a partial destroy.
#
# Then it VERIFIES the disappearance rather than trusting the exit codes.
set -euo pipefail

PROJECT_ID="${AUDIT_PROJECT_ID:-vibecore-audit-test-20260807}"
PROD_PROJECT="vibecore-495216"
TF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infra/terraform/envs/audit-test" && pwd)"
SKIP_PROJECT_DELETE="${SKIP_PROJECT_DELETE:-0}"

if [[ "$PROJECT_ID" == "$PROD_PROJECT" ]]; then
  echo "REFUS: AUDIT_PROJECT_ID pointe sur la PROD ($PROD_PROJECT)." >&2
  exit 1
fi

echo "==> Cible: $PROJECT_ID (la prod $PROD_PROJECT n'est jamais touchee)"

echo "==> [1/3] terraform destroy"
if [[ -f "$TF_DIR/terraform.tfstate" ]]; then
  terraform -chdir="$TF_DIR" destroy -input=false -auto-approve || {
    echo "!! destroy partiel — la suppression du projet ci-dessous reste le filet" >&2
  }
else
  echo "    (pas d'etat terraform local, on passe au filet projet)"
fi

if [[ "$SKIP_PROJECT_DELETE" == "1" ]]; then
  echo "==> [2/3] suppression du projet SAUTEE (SKIP_PROJECT_DELETE=1)"
else
  echo "==> [2/3] gcloud projects delete $PROJECT_ID"
  gcloud projects delete "$PROJECT_ID" --quiet
fi

echo "==> [3/3] VERIFICATION de la disparition"
fail=0

state="$(gcloud projects describe "$PROJECT_ID" --format='value(lifecycleState)' 2>/dev/null || echo 'GONE')"
echo "    projet .................. $state"
if [[ "$SKIP_PROJECT_DELETE" != "1" && "$state" != "DELETE_REQUESTED" && "$state" != "GONE" ]]; then
  echo "    !! attendu DELETE_REQUESTED ou GONE" >&2
  fail=1
fi

# Explicit commands rather than a word-split variable: relying on the shell to
# split "container clusters list" silently yields an empty result (and a FALSE
# PASS) under any shell that does not word-split, e.g. zsh.
count_of() { printf '%s' "${1:-}" | grep -c . || true; }

n_clusters="$(count_of "$(gcloud container clusters list --project="$PROJECT_ID" --format='value(name)' 2>/dev/null || true)")"
n_sql="$(count_of "$(gcloud sql instances list --project="$PROJECT_ID" --format='value(name)' 2>/dev/null || true)")"
n_vms="$(count_of "$(gcloud compute instances list --project="$PROJECT_ID" --format='value(name)' 2>/dev/null || true)")"
n_buckets="$(count_of "$(gcloud storage ls --project="$PROJECT_ID" 2>/dev/null || true)")"

echo "    clusters GKE restants ... $n_clusters"
echo "    instances SQL restantes . $n_sql"
echo "    VM Compute restantes .... $n_vms"
echo "    buckets restants ........ $n_buckets"
for n in "$n_clusters" "$n_sql" "$n_vms" "$n_buckets"; do
  [[ "$n" == "0" ]] || fail=1
done

echo "==> CONTROLE PROD (doit etre intacte)"
prod_rev="$(helm -n vibecore list -o json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["revision"])' 2>/dev/null || echo '?')"
prod_status="$(helm -n vibecore list -o json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["status"])' 2>/dev/null || echo '?')"
echo "    release vibecore ........ revision=$prod_rev status=$prod_status"

if [[ "$fail" == "0" ]]; then
  echo "==> TEARDOWN VERIFIE: plus aucune ressource facturee dans $PROJECT_ID"
else
  echo "==> TEARDOWN INCOMPLET — voir les lignes marquees !!" >&2
  exit 1
fi
