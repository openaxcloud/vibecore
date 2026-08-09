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

# shellcheck source=scripts/audit-env/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Le projet cible n'est PAS surchargeable. L'ancienne version acceptait
# n'importe quel AUDIT_PROJECT_ID sauf un unique ID de prod codé en dur : tout
# autre projet de l'organisation — staging, un projet client, un futur projet de
# prod — passait la garde et se faisait supprimer. Une liste d'autorisation d'un
# seul élément remplace l'exclusion d'un seul élément.
PROJECT_ID="$AUDIT_ENV_PROJECT_ID"
TF_DIR="${TF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infra/terraform/envs/audit-test" && pwd)}"
SKIP_PROJECT_DELETE="${SKIP_PROJECT_DELETE:-0}"
# Contexte kubectl de la PROD, pour le contrôle d'intégrité final. Explicite : le
# lire dans le contexte ambiant faisait passer la release d'AUDIT pour celle de
# prod, donc un « prod intacte » qui ne prouvait rien.
PROD_KUBE_CONTEXT="${PROD_KUBE_CONTEXT:-connectgateway_vibecore-495216_europe-west9_vibecore-prod-app}"

if [[ -n "${AUDIT_PROJECT_ID:-}" && "${AUDIT_PROJECT_ID}" != "$PROJECT_ID" ]]; then
  echo "REFUS (fail-closed): AUDIT_PROJECT_ID='$AUDIT_PROJECT_ID' n'est pas le projet d'audit." >&2
  echo "       Ce script ne détruit que '$PROJECT_ID'. Modifier lib.sh pour en changer." >&2
  exit 1
fi

# Liaison projet <-> état Terraform <-> cluster. Chacune est vérifiée par ID
# EXACT : sans ça rien ne garantit que l'état qu'on va `destroy` décrit bien le
# projet qu'on va supprimer.
audit_env_require_audit_project "$PROJECT_ID"
audit_env_require_tf_state_binding "$TF_DIR"

echo "==> Cible verrouillee: $PROJECT_ID (etat TF + cluster lies, prod jamais touchee)"

echo "==> [1/3] terraform destroy"
# L'existence de l'état et son appartenance à CE projet sont déjà prouvées par
# audit_env_require_tf_state_binding ci-dessus — plus de branche « pas d'état,
# on passe directement à la suppression du projet », qui détruisait un projet
# sans avoir jamais pu vérifier à quoi son état correspondait.
terraform -chdir="$TF_DIR" destroy -input=false -auto-approve || {
  echo "!! destroy partiel — la suppression du projet ci-dessous reste le filet" >&2
}

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
# --kube-context EXPLICITE. Sans lui, cette commande interrogeait le contexte
# courant — c'est-a-dire, pendant un teardown d'audit, le cluster d'AUDIT : elle
# affichait la release d'audit sous l'etiquette « prod » et un teardown qui
# aurait detruit la prod se serait quand meme conclu par « prod intacte ».
if kubectl config get-contexts -o name 2>/dev/null | grep -qx "$PROD_KUBE_CONTEXT"; then
  prod_json="$(helm --kube-context="$PROD_KUBE_CONTEXT" -n vibecore list -o json 2>/dev/null || echo '[]')"
  prod_rev="$(printf '%s' "$prod_json" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[0]["revision"] if d else "AUCUNE")' 2>/dev/null || echo '?')"
  prod_status="$(printf '%s' "$prod_json" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[0]["status"] if d else "AUCUNE")' 2>/dev/null || echo '?')"
  echo "    release vibecore (prod) . revision=$prod_rev status=$prod_status  [contexte: $PROD_KUBE_CONTEXT]"
  if [[ "$prod_rev" == "AUCUNE" || "$prod_rev" == "?" ]]; then
    echo "    !! la release de PROD est illisible — a verifier a la main avant de conclure" >&2
    fail=1
  fi
else
  echo "    contexte prod '$PROD_KUBE_CONTEXT' absent du kubeconfig."
  echo "    !! controle d'integrite prod NON EFFECTUE (pas un succes) — passer PROD_KUBE_CONTEXT" >&2
  fail=1
fi

if [[ "$fail" == "0" ]]; then
  echo "==> TEARDOWN VERIFIE: plus aucune ressource facturee dans $PROJECT_ID"
else
  echo "==> TEARDOWN INCOMPLET — voir les lignes marquees !!" >&2
  exit 1
fi
