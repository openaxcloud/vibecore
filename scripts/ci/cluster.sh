#!/usr/bin/env bash
# Enveloppe hermétique pour TOUT appel helm/kubectl d'un workflow GitHub Actions.
#
#   scripts/ci/cluster.sh prod-gateway helm    upgrade vibecore infra/helm/platform …
#   scripts/ci/cluster.sh prod-direct  helm    upgrade --install vibecore …
#   scripts/ci/cluster.sh staging      kubectl -n vibecore get pods
#
# ---------------------------------------------------------------------------
# DÉFAUT 1 (fermé au tour précédent) — la PORTÉE d'un `unset`.
#
# deploy-main.yml neutralisait les variables `HELM_*` dans l'étape de credentials,
# mais un `unset` ne franchit pas la frontière d'une étape : chaque `run:` est un
# shell neuf, ré-alimenté par le bloc `env:` du workflow et par l'environnement du
# runner. Et `--kube-context` ne couvre pas le problème : `HELM_KUBEAPISERVER`
# (+ `HELM_KUBETOKEN`) contourne le kubeconfig ENTIÈREMENT, donc le contexte nommé
# n'est même plus consulté.
#
# DÉFAUT 2 (fermé ici) — une SOUS-CHAÎNE n'est pas une identité.
#
# La version précédente se contentait de :
#   `[[ "$server" == *"vibecore-prod-app"* ]]`      (prod-gateway)
#   `[[ "$ctx"    == *"vibecore-495216"*   ]]`      (prod-direct)
#   `[[ "$ctx" != *prod* && "$server" != *gateway* ]]` (staging, deny-list)
#
# Trois trous, reproduits en hermétique par l'auditeur (faux Helm atteint, exit 0) :
#   * un AUTRE projet Connect Gateway portant une membership du même nom passait —
#     le nom de la membership est un libellé, pas une identité ;
#   * n'importe quel apiserver passait dès que le NOM du contexte contenait
#     `vibecore-495216` — or le nom d'un contexte est une chaîne libre, choisie par
#     celui qui écrit le kubeconfig ;
#   * une deny-list se contourne par construction : il suffit d'un nom qui évite
#     les motifs interdits.
#
# CE QUI EST VÉRIFIÉ MAINTENANT, dans cet ordre, à chaque appel :
#   1. l'environnement est neutralisé DANS LE PROCESSUS qui exécute l'outil ;
#   2. le NOM du contexte doit être EXACTEMENT celui de l'allow-list ;
#   3. l'apiserver attendu est RÉSOLU AUPRÈS DE GCP (autoritatif : Resource
#      Manager pour le numéro de projet, Fleet pour la membership, GKE pour
#      l'endpoint), puis comparé par ÉGALITÉ STRICTE à celui du kubeconfig.
#
# Aucune comparaison de sous-chaîne, aucune deny-list, et l'identité ne provient
# jamais d'un nom écrit dans un fichier : elle provient de l'API qui en est
# l'autorité. Une panne de résolution est un REFUS, pas un laissez-passer.
# ---------------------------------------------------------------------------
set -euo pipefail

# --- allow-list EXACTE, pinnée dans le code (l'infra est de l'IaC) ----------
readonly PROD_PROJECT_ID='vibecore-495216'
readonly PROD_PROJECT_NUMBER='267592214411'
readonly PROD_LOCATION='europe-west9'
readonly PROD_APP_CLUSTER='vibecore-prod-app'
# Contextes attendus, à la lettre.
readonly PROD_GATEWAY_CONTEXT="connectgateway_${PROD_PROJECT_ID}_${PROD_LOCATION}_${PROD_APP_CLUSTER}"
readonly PROD_DIRECT_CONTEXT="gke_${PROD_PROJECT_ID}_${PROD_LOCATION}_${PROD_APP_CLUSTER}"

die() {
  echo "REFUS (fail-closed): $*" >&2
  exit 1
}

# --- 1. neutraliser l'ambiant, ici, dans ce processus ----------------------
# Seuls les NOMS sont journalisés : `HELM_KUBETOKEN` est un jeton
# d'authentification au cluster et les logs d'Actions sont conservés.
HOSTILE=(
  HELM_KUBECONTEXT
  HELM_KUBEAPISERVER
  HELM_KUBETOKEN
  HELM_KUBECAFILE
  HELM_KUBEASUSER
  HELM_KUBEASGROUPS
  HELM_KUBEINSECURE_SKIP_TLS_VERIFY
  HELM_KUBETLS_SERVER_NAME
  HELM_NAMESPACE
)
neutralisees=()
for var in "${HOSTILE[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    neutralisees+=("$var")
  fi
  unset "$var"
done
if ((${#neutralisees[@]} > 0)); then
  echo "==> variables de redirection ignorees (noms seuls): ${neutralisees[*]}" >&2
fi

target="${1:?usage: cluster.sh <prod-gateway|prod-direct|staging> <helm|kubectl> [args…]}"
tool="${2:?usage: cluster.sh <cible> <helm|kubectl> [args…]}"
shift 2

case "$tool" in
  helm | kubectl) ;;
  *) die "outil '$tool' non pris en charge (helm ou kubectl uniquement)." ;;
esac

# --- identité du projet, auprès de l'autorité ------------------------------
# Le couple (id, numéro) est vérifié: un id de projet peut être recréé, le numéro
# non. Si Resource Manager ne répond pas, on refuse.
assert_prod_project() {
  local number
  number="$(gcloud projects describe "$PROD_PROJECT_ID" --format='value(projectNumber)' 2>/dev/null)" ||
    die "impossible de resoudre le projet '$PROD_PROJECT_ID' aupres de Resource Manager."
  [[ "$number" == "$PROD_PROJECT_NUMBER" ]] ||
    die "le projet '$PROD_PROJECT_ID' porte le numero '$number', pas '$PROD_PROJECT_NUMBER'."
}

# --- 2. le NOM du contexte, par égalité stricte ----------------------------
# --- 3. l'apiserver ATTENDU, résolu auprès de GCP --------------------------
ctx=''
expected_server=''

case "$target" in
  prod-gateway)
    ctx="${PROD_KUBE_CONTEXT:-$PROD_GATEWAY_CONTEXT}"
    [[ "$ctx" == "$PROD_GATEWAY_CONTEXT" ]] ||
      die "contexte '$ctx' != '$PROD_GATEWAY_CONTEXT' (allow-list d'un seul element)."
    assert_prod_project

    # La membership est lue chez Fleet : son nom canonique contient le PROJET
    # propriétaire. Un homonyme dans un autre projet ne peut donc pas passer.
    membership="$(gcloud container fleet memberships describe "$PROD_APP_CLUSTER" \
      --project="$PROD_PROJECT_ID" --location="$PROD_LOCATION" --format='value(name)' 2>/dev/null)" ||
      die "membership '$PROD_APP_CLUSTER' introuvable dans '$PROD_PROJECT_ID'/$PROD_LOCATION."
    [[ "$membership" == "projects/${PROD_PROJECT_ID}/locations/${PROD_LOCATION}/memberships/${PROD_APP_CLUSTER}" ]] ||
      die "identite de membership inattendue: '$membership'."

    # URL du Connect Gateway, reconstruite depuis le NUMÉRO de projet vérifié.
    expected_server="https://${PROD_LOCATION}-connectgateway.googleapis.com/v1/projects/${PROD_PROJECT_NUMBER}/locations/${PROD_LOCATION}/gkeMemberships/${PROD_APP_CLUSTER}"
    ;;

  prod-direct)
    # `get-gke-credentials` écrit un contexte `gke_<projet>_<région>_<cluster>` :
    # ce nom est exigé à la lettre, PAS « contient l'id du projet ».
    ctx="$(kubectl config current-context 2>/dev/null || true)"
    [[ -n "$ctx" ]] || die "aucun contexte courant — lancer d'abord l'etape de credentials."
    [[ "$ctx" == "$PROD_DIRECT_CONTEXT" ]] ||
      die "contexte '$ctx' != '$PROD_DIRECT_CONTEXT' (allow-list d'un seul element)."
    assert_prod_project

    endpoint="$(gcloud container clusters describe "$PROD_APP_CLUSTER" \
      --project="$PROD_PROJECT_ID" --location="$PROD_LOCATION" --format='value(endpoint)' 2>/dev/null)" ||
      die "endpoint du cluster '$PROD_APP_CLUSTER' non resolu aupres de GKE."
    [[ -n "$endpoint" ]] || die "GKE a renvoye un endpoint vide pour '$PROD_APP_CLUSTER'."
    expected_server="https://${endpoint}"
    ;;

  staging)
    # Aucune identité de staging n'est épinglée, et ce n'est pas un oubli : le dépôt
    # ne définit ni `vars.STAGING_APP_CLUSTER` ni `vars.GCP_REGION` (vérifié — seules
    # `GAR_LOCATION` et `GCP_PROJECT_ID` existent), donc il n'y a aujourd'hui aucun
    # cluster de staging à autoriser. Une deny-list « tout sauf ce qui ressemble à la
    # prod » se contourne par construction : il suffit d'un nom qui évite les motifs.
    # On refuse donc, en disant quoi faire — ajouter le triplet (projet+numéro,
    # région, cluster) à l'allow-list ci-dessus, dans le commit même qui provisionne
    # l'environnement.
    die "aucune identite de staging n'est epinglee dans l'allow-list — refus. Ajouter (projet+numero, region, cluster) dans scripts/ci/cluster.sh, dans le commit qui provisionne le staging."
    ;;

  *) die "cible '$target' inconnue (prod-gateway | prod-direct | staging)." ;;
esac

# --- comparaison par ÉGALITÉ STRICTE avec le kubeconfig --------------------
cluster="$(kubectl config view -o "jsonpath={.contexts[?(@.name=='${ctx}')].context.cluster}")"
[[ -n "$cluster" ]] || die "contexte '$ctx' absent du kubeconfig."

server="$(kubectl config view -o "jsonpath={.clusters[?(@.name=='${cluster}')].cluster.server}")"
[[ -n "$server" ]] || die "le cluster '$cluster' n'a pas d'apiserver dans le kubeconfig."

[[ "$server" == "$expected_server" ]] ||
  die "apiserver '$server' != identite autoritative '$expected_server'."

echo "==> cible ${target} verifiee (identite autoritative): ${ctx} -> ${server}" >&2

if [[ "$tool" == "helm" ]]; then
  exec helm --kube-context="$ctx" "$@"
fi

exec kubectl --context="$ctx" "$@"
