#!/usr/bin/env bash
# Déploie une release ISOLÉE de la plateforme sur le cluster d'audit.
#
#   scripts/audit-env/deploy-isolated.sh <release> <tag-image>
#
# POURQUOI UNE RELEASE ISOLÉE.
#
# Les preuves live tournaient jusqu'ici sur la release partagée `vibecore` du
# cluster d'audit — celle que d'autres sessions modifient aussi. Deux fois, un
# `kubectl set image` concurrent sur le tier `web` a fait refuser la mesure (c'est
# le garde de flotte qui a tenu, mais la preuve a dû être relancée), et un
# `helm upgrade` a buté sur des conflits de propriété de champs. Une preuve dont
# l'environnement peut changer sous elle n'est pas reproductible : on lui donne
# donc sa propre release, sa propre namespace et sa propre namespace de runtime.
#
# CE QUI EST ISOLÉ :
#   * release + namespace plateforme .. <release> / <release>
#   * namespace de runtime ............ <release>-workspaces (RuntimeClass,
#     NetworkPolicies, quota installés par le chart workspaces-runtime)
#   * noms de service in-cluster ...... <release>-vibecore-platform-*
#   * hôtes d'ingress ................. distincts, pour ne pas entrer en conflit
#     avec ceux de la release partagée
#
# CE QUI EST PARTAGÉ, à dessein : le cluster, Cloud SQL et Redis (les URL viennent
# du même Secret). L'isolation visée porte sur la RELEASE, pas sur l'infrastructure
# — dupliquer la base coûterait cher et ne rendrait pas la preuve plus vraie.
#
# À LA FIN, le script VÉRIFIE LES DIGESTS : pour chaque pod, l'`imageID` observé
# doit correspondre au digest publié dans Artifact Registry pour le tag demandé.
# Un tag est un libellé mutable ; seul le digest dit ce qui tourne réellement.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

# shellcheck source=scripts/audit-env/lib.sh
source "$HERE/lib.sh"

RELEASE="${1:?usage: deploy-isolated.sh <release> <tag-image>}"
TAG="${2:?usage: deploy-isolated.sh <release> <tag-image>}"

# Garde-fou de nommage : la release isolée ne doit JAMAIS pouvoir s'appeler comme
# la release partagée, sinon ce script l'écraserait — l'inverse du but poursuivi.
if [[ "$RELEASE" == "vibecore" ]]; then
  echo "REFUS (fail-closed): 'vibecore' est la release PARTAGEE. Choisir un autre nom." >&2
  exit 1
fi

NS="$RELEASE"
RUNTIME_NS="$RELEASE-workspaces"
REGISTRY="europe-west9-docker.pkg.dev/$AUDIT_ENV_PROJECT_ID/vibecore-audit-containers"
SHARED_SECRET_NS=vibecore
SECRET_NAME=vibecore-platform-secrets
BASE_VALUES="${BASE_VALUES:-/Users/hb/dev/vibecore/infra/terraform/envs/audit-test/credentials/values-audit-test.rendered.yaml}"

audit_env_pin_cluster_target
audit_env_require_audit_cluster

[[ -f "$BASE_VALUES" ]] || {
  echo "REFUS: valeurs de base absentes ($BASE_VALUES) — lancer d'abord render-values.sh." >&2
  exit 1
}

echo "==> release isolee '$RELEASE' (ns $NS, runtime $RUNTIME_NS), tag $TAG"

# --- 1. valeurs dérivées de celles de l'env d'audit -------------------------
# On RÉÉCRIT les URL in-cluster : elles contiennent le nom de la release partagée
# (`vibecore-vibecore-platform-api.vibecore.svc`) parce que le fullname du chart est
# `<release>-<chart>`. Sans cette réécriture, la release isolée parlerait aux
# services de la release partagée — et la preuve porterait sur les mauvais pods.
LB_IP="$(audit_kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
BASE_REWRITTEN="$(mktemp -t values-isolated-base-XXXXXX.yaml)"
OVERRIDES="$(mktemp -t values-isolated-over-XXXXXX.yaml)"
trap 'rm -f "$BASE_REWRITTEN" "$OVERRIDES"' EXIT

sed \
  -e "s|vibecore-vibecore-platform-|${RELEASE}-vibecore-platform-|g" \
  -e "s|\.vibecore\.svc|.${NS}.svc|g" \
  "$BASE_VALUES" > "$BASE_REWRITTEN"

# Les surcharges vont dans un fichier SÉPARÉ, passé en second `-f`.
#
# POURQUOI PAS EN LES AJOUTANT À LA FIN DU PREMIER (ce que faisait ce script, à
# tort) : `global:` existe déjà dans les valeurs d'audit. Ajouter un second
# `global:` dans le MÊME document YAML ne fusionne rien — c'est la même clé de
# mapping, et le dernier gagne : tout le reste de `global` disparaissait
# silencieusement, dont `dns01.enabled: false`, `workloadIdentity` et `labels`.
# Effet observé : le ClusterIssuer DNS-01 du chart se rendait à nouveau, sous le
# nom déjà pris par celui qu'installe addons.sh, et Helm refusait l'install. Le
# reste aurait été pire car silencieux (les pods auraient perdu leurs annotations
# Workload Identity, donc des 403 GCS ressemblant à un souci de droits bucket).
# Helm, lui, fusionne EN PROFONDEUR plusieurs `-f` : `global.appDomain` se
# surcharge alors sans toucher à `global.dns01`.
#
# Hôtes distincts par ailleurs : deux Ingress qui revendiquent le même host se
# marchent dessus. Le rejeu passe par les Services in-cluster, mais un Ingress en
# conflit rendrait la release isolée visiblement cassée pour rien.
cat > "$OVERRIDES" <<YAML
# --- surcharges propres a la release isolee (ecrites par deploy-isolated.sh) ---
global:
  appDomain: '${RELEASE}.${LB_IP}.sslip.io'
  apiDomain: 'api-${RELEASE}.${LB_IP}.sslip.io'
  marketingDomain: ''
  workspaceManagerDomain: 'wsm-${RELEASE}.${LB_IP}.sslip.io'
  previewDomain: 'preview-${RELEASE}.${LB_IP}.sslip.io'
platformEnv:
  runtime:
    # Namespace de runtime DÉDIÉE : le workspace-manager de la release partagée ne
    # doit pas ramasser (GC) les workspaces de cette preuve, ni l'inverse.
    workspaceRuntimeNamespace: '${RUNTIME_NS}'
YAML

# --- 2. namespaces, avec les marqueurs d'adoption Helm ----------------------
audit_env_ensure_namespace "$NS" "$RELEASE"

# --- 3. le Secret plateforme, recopié depuis la release partagée ------------
# Même base, même Redis : on veut la MÊME infrastructure, seule la release change.
# Les clés sensibles ne transitent pas par le disque local — tout se fait par un
# tube entre deux appels kubectl épinglés.
echo "==> copie du Secret $SECRET_NAME vers $NS"
audit_kubectl -n "$SHARED_SECRET_NS" get secret "$SECRET_NAME" -o json |
  python3 -c '
import json, sys
d = json.load(sys.stdin)
d["metadata"] = {"name": d["metadata"]["name"], "namespace": sys.argv[1]}
json.dump(d, sys.stdout)
' "$NS" |
  audit_kubectl -n "$NS" apply -f - >/dev/null

# --- 4. runtime des workspaces dans SA namespace ---------------------------
echo "==> chart workspaces-runtime dans $RUNTIME_NS"
#
# DEUX POINTS APPRIS EN LE FAISANT, tous deux vérifiés sur le cluster :
#
# 1. `RuntimeClass` et `StorageClass` sont CLUSTER-SCOPED. La release partagée les
#    possède déjà, et Helm refuse — à juste titre — de les importer dans une autre
#    release : « invalid ownership metadata ». Ce sont des objets d'échelle cluster,
#    légitimement partagés (comme Cloud SQL) ; les dupliquer n'aurait aucun sens.
#    Sur GKE la RuntimeClass gvisor est de toute façon fournie par le cluster.
#
# 2. Le RoleBinding de cette namespace de runtime cible
#    `workspaceManager.serviceAccountName`, dont la valeur par défaut porte le nom de
#    la release PARTAGÉE. Laissé tel quel, il aurait donné les droits au manager
#    partagé et pas au mien : le manager isolé n'aurait pas pu créer de pod dans sa
#    propre namespace, et la porte n'aurait rien prouvé. Le nom suit donc la release.
audit_helm upgrade --install "$RELEASE-workspaces" "$REPO/infra/helm/workspaces-runtime" \
  --namespace "$RUNTIME_NS" --create-namespace \
  --set namespace="$RUNTIME_NS" --set platformNamespace="$NS" \
  --set runtimeClass.enabled=false \
  --set storageClass.enabled=false \
  --set workspaceManager.serviceAccountName="$RELEASE-vibecore-platform-workspace-manager" \
  --wait --timeout 5m >/dev/null

# --- 5. la plateforme -------------------------------------------------------
echo "==> helm upgrade --install $RELEASE (ns $NS)"
audit_helm upgrade --install "$RELEASE" "$REPO/infra/helm/platform" \
  --namespace "$NS" \
  -f "$REPO/infra/helm/platform/values.yaml" \
  -f "$BASE_REWRITTEN" \
  -f "$OVERRIDES" \
  --set global.imageTag="$TAG" \
  --set platformEnv.runtime.workspaceAgentImage="$REGISTRY/workspace-agent:sha-$TAG" \
  --timeout 15m

for comp in api preview-proxy workspace-manager screenshotter; do
  audit_kubectl -n "$NS" rollout status "deploy/$RELEASE-vibecore-platform-$comp" --timeout=420s
done

# --- 6. VÉRIFICATION DES DIGESTS -------------------------------------------
# Un tag est mutable : `api:$TAG` peut désigner autre chose demain, et un pod peut
# tourner sur une image tirée avant un re-push. On compare donc l'`imageID` du
# conteneur (le digest réellement tiré) au digest publié pour ce tag.
echo
echo "==> verification des digests (imageID du pod == digest du registre)"
ecarts=0
for comp in api worker admin ai-gateway workspace-manager preview-proxy screenshotter web; do
  want="$(gcloud artifacts docker images describe "$REGISTRY/$comp:$TAG" \
    --project="$AUDIT_ENV_PROJECT_ID" --format='value(image_summary.digest)' 2>/dev/null || true)"

  if [[ -z "$want" ]]; then
    printf '  %-20s ABSENTE du registre\n' "$comp"
    ecarts=$((ecarts + 1))
    continue
  fi

  mapfile -t got < <(audit_kubectl -n "$NS" get pods \
    -l "app.kubernetes.io/component=$comp" \
    -o jsonpath='{range .items[*]}{.status.containerStatuses[0].imageID}{"\n"}{end}' | sed 's/.*@//' | sort -u)

  if ((${#got[@]} == 0)); then
    printf '  %-20s aucun pod\n' "$comp"
    ecarts=$((ecarts + 1))
    continue
  fi

  for d in "${got[@]}"; do
    if [[ "$d" == "$want" ]]; then
      printf '  %-20s OK   %s\n' "$comp" "${d:0:23}…"
    else
      printf '  %-20s ECART pod=%s registre=%s\n' "$comp" "${d:0:23}…" "${want:0:23}…"
      ecarts=$((ecarts + 1))
    fi
  done
done

if ((ecarts > 0)); then
  echo "REFUS: $ecarts ecart(s) de digest — ce qui tourne n'est pas ce qui a ete publie." >&2
  exit 1
fi

echo
echo "==> release isolee prete: $RELEASE / ns $NS / runtime $RUNTIME_NS / tag $TAG"
echo "==> rejeu:  RELEASE=$RELEASE NS=$NS RUNTIME_NS=$RUNTIME_NS WS_ID=ws-$RELEASE \\"
echo "              scripts/proofs/replay-preview-doors.sh $TAG"
