#!/usr/bin/env bash
# Enveloppe hermétique pour TOUT appel helm/kubectl d'un workflow GitHub Actions.
#
#   scripts/ci/cluster.sh prod-gateway helm    upgrade vibecore infra/helm/platform …
#   scripts/ci/cluster.sh prod-direct  helm    upgrade --install vibecore …
#   scripts/ci/cluster.sh staging      kubectl -n vibecore get pods
#
# LE DÉFAUT QUE CECI FERME. deploy-main.yml neutralisait les variables `HELM_*`
# dans l'étape « Get cluster credentials »… et un `unset` ne franchit pas la
# frontière d'une étape : chaque `run:` est un shell neuf, ré-alimenté par le bloc
# `env:` du workflow et par l'environnement du runner. Les étapes suivantes
# repartaient donc avec les variables intactes. Et `--kube-context` ne suffit pas à
# les couvrir : `HELM_KUBEAPISERVER` (+ `HELM_KUBETOKEN`) contourne le kubeconfig
# ENTIÈREMENT, donc le contexte nommé n'est même plus consulté. Un
# `HELM_KUBEAPISERVER=https://127.0.0.1:1` faisait échouer l'upgrade de prod ;
# pointé sur un autre apiserver, il l'y aurait appliqué.
#
# Trois propriétés, à chaque appel :
#   1. l'environnement est neutralisé DANS LE PROCESSUS QUI EXÉCUTE L'OUTIL —
#      c'est la seule portée où un `unset` a un sens ;
#   2. la cible est NOMMÉE explicitement (`--kube-context` / `--context`), jamais
#      héritée du « contexte courant » ;
#   3. l'identité de cette cible est vérifiée dans le kubeconfig avant d'agir,
#      selon la cible demandée — sinon un kubeconfig substitué pourrait définir un
#      contexte du bon NOM pointant ailleurs.
#
# Les trois cibles existent parce que les workflows s'authentifient de deux façons
# différentes, et qu'il faut vérifier ce qui est réellement vérifiable :
#   prod-gateway  Connect Gateway (`fleet memberships get-credentials`), utilisé
#                 par deploy-main.yml et ar-protect-images.yml. Le nom du contexte
#                 est déterministe -> allow-list d'UN élément + apiserver vérifié.
#   prod-direct   action `get-gke-credentials` (deploy-prod.yml). Le nom du contexte
#                 est `gke_<projet>_<région>_<cluster>` et dépend de `vars.*`, donc
#                 il n'est pas connu du dépôt : on exige qu'il désigne le PROJET de
#                 production, ce qui est la propriété qui compte.
#   staging       même action, cluster de staging : on exige l'inverse, que la cible
#                 ne soit PAS un cluster de production.
set -euo pipefail

readonly PROD_PROJECT_ID='vibecore-495216'
readonly PROD_GATEWAY_CONTEXT='connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'
readonly PROD_MEMBERSHIP='vibecore-prod-app'
readonly GATEWAY_HOST='connectgateway.googleapis.com'

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

# --- 2. nommer la cible ----------------------------------------------------
# `current-context` n'est lu QUE pour les cibles dont le nom dépend de `vars.*` du
# dépôt ; il est ensuite passé explicitement et son identité est contrôlée.
ctx=''
case "$target" in
  prod-gateway)
    # PROD_KUBE_CONTEXT est renseignée par l'étape de credentials ; elle est
    # CONFRONTÉE à la constante, jamais utilisée telle quelle.
    ctx="${PROD_KUBE_CONTEXT:-$PROD_GATEWAY_CONTEXT}"
    [[ "$ctx" == "$PROD_GATEWAY_CONTEXT" ]] ||
      die "contexte '$ctx' != '$PROD_GATEWAY_CONTEXT' (allow-list d'un seul element)."
    ;;
  prod-direct | staging)
    ctx="$(kubectl config current-context 2>/dev/null || true)"
    [[ -n "$ctx" ]] || die "aucun contexte courant — lancer d'abord l'etape de credentials."
    ;;
  *) die "cible '$target' inconnue (prod-gateway | prod-direct | staging)." ;;
esac

# --- 3. vérifier l'IDENTITÉ de la cible, pas seulement son nom -------------
cluster="$(kubectl config view -o "jsonpath={.contexts[?(@.name=='${ctx}')].context.cluster}")"
[[ -n "$cluster" ]] || die "contexte '$ctx' absent du kubeconfig."

server="$(kubectl config view -o "jsonpath={.clusters[?(@.name=='${cluster}')].cluster.server}")"
[[ -n "$server" ]] || die "le cluster '$cluster' n'a pas d'apiserver dans le kubeconfig."

case "$target" in
  prod-gateway)
    [[ "$server" == "https://${GATEWAY_HOST}/"* ]] ||
      die "l'apiserver de '$ctx' n'est pas le Connect Gateway attendu."
    [[ "$server" == *"${PROD_MEMBERSHIP}"* ]] ||
      die "l'apiserver de '$ctx' ne pointe pas sur la membership '${PROD_MEMBERSHIP}'."
    ;;
  prod-direct)
    # `get-gke-credentials` écrit un contexte `gke_<projet>_<zone>_<cluster>`.
    [[ "$ctx" == *"${PROD_PROJECT_ID}"* ]] ||
      die "la cible '$ctx' ne designe pas le projet de production '${PROD_PROJECT_ID}'."
    ;;
  staging)
    # Symétrique : un déploiement de staging ne doit jamais atterrir en prod, que
    # ce soit par un `vars.STAGING_APP_CLUSTER` mal renseigné ou par un kubeconfig
    # substitué.
    if [[ "$ctx" == *"${PROD_MEMBERSHIP}"* || "$server" == *"${GATEWAY_HOST}"* ]]; then
      die "la cible '$ctx' ressemble a la PRODUCTION — refus sur un chemin staging."
    fi
    ;;
esac

echo "==> cible ${target} verifiee: ${ctx} -> ${server}" >&2

if [[ "$tool" == "helm" ]]; then
  exec helm --kube-context="$ctx" "$@"
fi

exec kubectl --context="$ctx" "$@"
