#!/usr/bin/env bash
# Helpers shared by the audit-env scripts. Sourced, never executed.

# ---------------------------------------------------------------------------
# Identity of the audit environment — PINNED, not configurable.
#
# These scripts write the platform Secret, delete namespaces and delete an
# entire GCP project. The only thing standing between them and a production
# cluster is the guard below, so the target is a hard-coded ALLOW-LIST OF ONE.
# Provisioning a different audit environment means editing these three
# constants in the same commit that creates it — the environment is IaC, so its
# identity belongs in the code, not in an operator's shell variables.
# ---------------------------------------------------------------------------
readonly AUDIT_ENV_PROJECT_ID='vibecore-audit-test-20260807'
readonly AUDIT_ENV_CLUSTER_NAME='vibecore-audit-cluster'
readonly AUDIT_ENV_CLUSTER_ZONE='europe-west9-a'
# Labels the audit project/cluster carry and a production one must not.
readonly AUDIT_ENV_REQUIRED_LABELS='env=audit-test ephemeral=true'

_audit_env_die() {
  echo "REFUS (fail-closed): $*" >&2
  echo "       Cible autorisée: projet '$AUDIT_ENV_PROJECT_ID', cluster" >&2
  echo "       '$AUDIT_ENV_CLUSTER_NAME' en '$AUDIT_ENV_CLUSTER_ZONE'." >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Épinglage de la cible cluster — LA cible validée doit être LA cible utilisée.
#
# LE DÉFAUT QUE CECI FERME. Les gardes vérifiaient le contexte kubectl *courant*,
# puis les scripts appelaient `helm` et `kubectl` SANS contexte explicite. Or
# Helm ne résout pas sa cible via le contexte courant : il consulte d'abord ses
# variables d'environnement. Reproduit en lecture seule sur cette branche :
#
#   contexte courant = audit  ->  audit_env_require_audit_cluster : PASSE
#   HELM_KUBECONTEXT=<prod> helm -n vibecore list  ->  revision 971 = PRODUCTION
#   (sans la variable)      helm -n vibecore list  ->  revision 4   = audit
#
# Autrement dit `addons.sh` pouvait VALIDER l'audit puis lancer ses trois
# `helm upgrade --install` contre la PROD. La cible validée n'était pas la cible
# utilisée : une garde qui contrôle A pendant que l'outil frappe B ne garde rien.
#
# La correction tient en trois temps, dans cet ordre :
#   1. NEUTRALISER l'ambiant — toute variable capable de rediriger Helm ou
#      kubectl est effacée. Pas « lue puis validée » : effacée. Une valeur
#      d'environnement n'a aucune autorité sur la cible de ces scripts.
#   2. DÉRIVER la cible une seule fois, depuis les constantes épinglées
#      ci-dessus (jamais depuis l'environnement ni le contexte courant).
#   3. FORCER cette cible sur CHAQUE appel, via les enveloppes `audit_kubectl`
#      et `audit_helm`. Un appel nu redevient possible à écrire, donc
#      scripts/audit-env/check-pinned-context.mjs échoue s'il en reste un — la
#      règle est vérifiée par la CI (Gate 1), pas seulement par la relecture.
# ---------------------------------------------------------------------------

# Variables qui redirigent Helm vers un AUTRE cluster, y compris vers un
# apiserver arbitraire sans passer par le kubeconfig (HELM_KUBEAPISERVER +
# HELM_KUBETOKEN suffisent). HELM_NAMESPACE est incluse : elle déplace la cible
# d'un `helm upgrade` sans changer de cluster.
readonly AUDIT_ENV_HOSTILE_ENV_VARS=(
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

# Épingle la cible. Idempotent, à appeler tout en haut de chaque script.
audit_env_pin_cluster_target() {
  local var found=() ctx

  # --- 1. neutraliser l'ambiant -------------------------------------------
  for var in "${AUDIT_ENV_HOSTILE_ENV_VARS[@]}"; do
    if [[ -n "${!var:-}" ]]; then
      found+=("$var=${!var}")
    fi
    unset "$var"
  done

  # KUBECONFIG est le second vecteur : un autre fichier, donc un autre
  # « contexte courant », vu à la fois par helm et par kubectl. On impose le
  # chemin par défaut au lieu d'honorer l'override.
  if [[ -n "${KUBECONFIG:-}" && "${KUBECONFIG}" != "$HOME/.kube/config" ]]; then
    found+=("KUBECONFIG=${KUBECONFIG}")
  fi
  export KUBECONFIG="$HOME/.kube/config"

  if ((${#found[@]} > 0)); then
    echo "==> variables de redirection IGNOREES (l'environnement ne choisit pas la cible) :" >&2
    printf '      %s\n' "${found[@]}" >&2
  fi

  # --- 2. dériver la cible, depuis les constantes épinglées ----------------
  # Format écrit par `gcloud container clusters get-credentials` (runbook §3).
  ctx="gke_${AUDIT_ENV_PROJECT_ID}_${AUDIT_ENV_CLUSTER_ZONE}_${AUDIT_ENV_CLUSTER_NAME}"

  kubectl config get-contexts -o name 2>/dev/null | grep -qx "$ctx" ||
    _audit_env_die "contexte '$ctx' absent de $KUBECONFIG — lancer d'abord: gcloud container clusters get-credentials $AUDIT_ENV_CLUSTER_NAME --zone $AUDIT_ENV_CLUSTER_ZONE --project $AUDIT_ENV_PROJECT_ID"

  AUDIT_KUBE_CONTEXT="$ctx"
  readonly AUDIT_KUBE_CONTEXT
  export AUDIT_KUBE_CONTEXT

  echo "==> cible epinglee: contexte '$AUDIT_KUBE_CONTEXT' (KUBECONFIG=$KUBECONFIG)"
}

# --- 3. enveloppes : la cible est passée EXPLICITEMENT, toujours -----------
# Aucun appel ne doit contourner ces deux fonctions.
audit_kubectl() {
  [[ -n "${AUDIT_KUBE_CONTEXT:-}" ]] || _audit_env_die "audit_kubectl appelé avant audit_env_pin_cluster_target."
  command kubectl --context="$AUDIT_KUBE_CONTEXT" "$@"
}

audit_helm() {
  [[ -n "${AUDIT_KUBE_CONTEXT:-}" ]] || _audit_env_die "audit_helm appelé avant audit_env_pin_cluster_target."
  command helm --kube-context="$AUDIT_KUBE_CONTEXT" "$@"
}

# Assert that the GCP PROJECT itself is the audit project, by exact ID plus the
# ephemeral labels. Used by the scripts that act on the project (teardown, TTL)
# and as the first half of the cluster check.
#
# Takes the project id to act on so a caller can never act on one id while
# having validated another.
audit_env_require_audit_project() {
  local target="${1:?project id}" labels lbl

  # Exact string equality against the allow-list of one. NOT a substring match:
  # a check like `case $x in *vibecore-prod*)` both misses `vibecore-495216`
  # (the real production project, whose id contains no such substring) and can
  # be defeated by any name that merely avoids the needle.
  [[ "$target" == "$AUDIT_ENV_PROJECT_ID" ]] ||
    _audit_env_die "projet '$target' != '$AUDIT_ENV_PROJECT_ID'."

  # The project must still LOOK like a throwaway: read its labels from the
  # Resource Manager API (authoritative, server-side), and require every
  # ephemerality label. A production project carries none of them, so even a
  # future id collision cannot slip through.
  labels="$(gcloud projects describe "$target" --format='value(labels)' 2>/dev/null)" ||
    _audit_env_die "projet '$target' introuvable ou inaccessible."
  for lbl in $AUDIT_ENV_REQUIRED_LABELS; do
    [[ "$labels" == *"$lbl"* ]] ||
      _audit_env_die "le projet '$target' ne porte pas le label '$lbl' (labels: ${labels:-aucun})."
  done

  echo "==> garde-fou projet OK: $target [$labels]"
}

# Assert that the CURRENT kubectl context provably dials the audit cluster.
#
# The previous version tested only whether the context NAME contained
# 'vibecore-prod'. A context name is a local alias chosen by whoever wrote the
# kubeconfig: `kubectl config rename-context ... prod-boring-name` defeats it
# entirely, and the scripts would then have overwritten the PRODUCTION platform
# Secret. Names are not identity. These three proofs are, and all three are
# required:
#
#   A. ENDPOINT — the API server the current context actually dials must equal
#      the endpoint the GKE API reports for the audit cluster, addressed by
#      EXACT project + zone + name. Nothing about the context name is trusted.
#   B. PROVIDER ID — the live nodes must declare the exact audit project in
#      `spec.providerID` (`gce://<project>/<zone>/<node>`). This comes from the
#      cluster itself, so it cannot be forged locally.
#   C. LABELS — the cluster's own resourceLabels must mark it ephemeral.
#
# NOTE: proof A compares against the cluster's direct endpoint, which is what
# `gcloud container clusters get-credentials` writes (runbook §3 step 3). A
# Connect-Gateway kubeconfig is deliberately refused rather than special-cased:
# refusing a legitimate access path is cheap, guessing wrong is not.
audit_env_require_audit_cluster() {
  local ctx server want_endpoint provider provider_project labels lbl

  command -v kubectl >/dev/null || _audit_env_die "kubectl absent."
  command -v gcloud >/dev/null || _audit_env_die "gcloud absent."

  # La cible épinglée, PAS le contexte courant : c'est tout l'objet du
  # correctif — on valide exactement ce que les enveloppes vont utiliser.
  [[ -n "${AUDIT_KUBE_CONTEXT:-}" ]] || audit_env_pin_cluster_target
  ctx="$AUDIT_KUBE_CONTEXT"

  audit_env_require_audit_project "$AUDIT_ENV_PROJECT_ID"

  # --- A. endpoint réellement composé par le contexte courant ---------------
  server="$(kubectl config view --minify --context="$ctx" -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null)"
  [[ -n "$server" ]] || _audit_env_die "endpoint du contexte '$ctx' illisible."

  want_endpoint="$(gcloud container clusters describe "$AUDIT_ENV_CLUSTER_NAME" \
    --zone "$AUDIT_ENV_CLUSTER_ZONE" --project "$AUDIT_ENV_PROJECT_ID" \
    --format='value(endpoint)' 2>/dev/null)"
  [[ -n "$want_endpoint" ]] ||
    _audit_env_die "cluster d'audit introuvable via l'API GKE (projet/zone/nom exacts)."

  [[ "$server" == "https://$want_endpoint" ]] ||
    _audit_env_die "le contexte '$ctx' dial '$server', or le cluster d'audit est 'https://$want_endpoint'."

  # --- B. providerID des nœuds vivants -------------------------------------
  provider="$(audit_kubectl get nodes -o jsonpath='{.items[0].spec.providerID}' 2>/dev/null)"
  [[ -n "$provider" ]] || _audit_env_die "aucun nœud lisible sur '$ctx'."
  provider_project="$(printf '%s' "$provider" | sed -E 's#^gce://([^/]+)/.*#\1#')"
  [[ "$provider_project" == "$AUDIT_ENV_PROJECT_ID" ]] ||
    _audit_env_die "les nœuds déclarent le projet '$provider_project', pas '$AUDIT_ENV_PROJECT_ID'."

  # --- C. labels du cluster ------------------------------------------------
  labels="$(gcloud container clusters describe "$AUDIT_ENV_CLUSTER_NAME" \
    --zone "$AUDIT_ENV_CLUSTER_ZONE" --project "$AUDIT_ENV_PROJECT_ID" \
    --format='value(resourceLabels)' 2>/dev/null)"
  for lbl in $AUDIT_ENV_REQUIRED_LABELS; do
    [[ "$labels" == *"$lbl"* ]] ||
      _audit_env_die "le cluster ne porte pas le label '$lbl' (labels: ${labels:-aucun})."
  done

  echo "==> garde-fou cluster OK: contexte '$ctx' -> $server"
  echo "    projet(nœuds)=$provider_project  cluster=$AUDIT_ENV_CLUSTER_NAME  labels=[$labels]"
}

# Assert that a Terraform state directory describes THIS project AND THIS
# cluster, so a teardown can never destroy state belonging to another
# environment. Binds project <-> TF state <-> cluster instead of trusting a
# path or a variable.
audit_env_require_tf_state_binding() {
  local tf_dir="${1:?terraform dir}" tf_project tf_cluster tf_zone

  [[ -f "$tf_dir/terraform.tfstate" ]] ||
    _audit_env_die "pas d'état Terraform dans '$tf_dir' — impossible de lier l'état au projet."

  tf_project="$(terraform -chdir="$tf_dir" output -raw project_id 2>/dev/null)" ||
    _audit_env_die "l'état de '$tf_dir' n'expose pas project_id."
  tf_cluster="$(terraform -chdir="$tf_dir" output -raw cluster_name 2>/dev/null || true)"
  tf_zone="$(terraform -chdir="$tf_dir" output -raw cluster_zone 2>/dev/null || true)"

  [[ "$tf_project" == "$AUDIT_ENV_PROJECT_ID" ]] ||
    _audit_env_die "l'état Terraform décrit le projet '$tf_project', pas '$AUDIT_ENV_PROJECT_ID'."
  [[ "$tf_cluster" == "$AUDIT_ENV_CLUSTER_NAME" ]] ||
    _audit_env_die "l'état Terraform décrit le cluster '$tf_cluster', pas '$AUDIT_ENV_CLUSTER_NAME'."
  [[ "$tf_zone" == "$AUDIT_ENV_CLUSTER_ZONE" ]] ||
    _audit_env_die "l'état Terraform décrit la zone '$tf_zone', pas '$AUDIT_ENV_CLUSTER_ZONE'."

  echo "==> garde-fou état TF OK: $tf_dir -> projet=$tf_project cluster=$tf_cluster/$tf_zone"
}

# Create the platform namespace so that the LATER `helm install` ADOPTS it
# instead of refusing to run.
#
# The namespace has to exist before helm is invoked: helm stores the release
# Secret in it, and the chart's pre-install hooks (the Prisma migration Job) are
# created in it too. But the chart ALSO templates the Namespace object — so if
# the namespace is created here as a plain `kubectl apply`, helm sees an existing
# object it does not own and aborts the whole install with
#   Unable to continue with install: Namespace "vibecore" in namespace ""
#   exists and cannot be imported into the current release: invalid ownership
#   metadata; label validation error: missing key
#   "app.kubernetes.io/managed-by": must be set to "Helm"; annotation validation
#   error: missing key "meta.helm.sh/release-name" ...
# (constaté en réel sur le cluster de test d'audit, 2026-08-07).
#
# Stamping helm's three ownership markers up front is helm's documented adoption
# path: the install then takes the namespace over and reconciles it to the
# chart's version, Pod Security labels included. `--create-namespace` is NOT a
# substitute — it creates the namespace WITHOUT these markers, so it hits the
# very same error.
audit_env_ensure_namespace() {
  local ns="${1:?namespace}"
  local release="${2:?helm release name}"
  audit_kubectl apply -f - <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: ${ns}
  labels:
    app.kubernetes.io/managed-by: Helm
  annotations:
    meta.helm.sh/release-name: ${release}
    meta.helm.sh/release-namespace: ${ns}
YAML
}
