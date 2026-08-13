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
#   * namespace de runtime ............ <release>-workspaces (NetworkPolicies et
#     quota installés par le chart workspaces-runtime)
#   * noms de service in-cluster ...... <release>-vibecore-platform-*
#   * hôtes d'ingress ................. distincts, pour ne pas entrer en conflit
#     avec ceux de la release partagée
#   * Redis et le puits e-mail ........ ses propres doubles dans sa namespace ;
#     partager Redis, ce serait partager les files BullMQ et le pub/sub de
#     collaboration — et les NetworkPolicies l'interdisent de toute façon
#
# CE QUI EST PARTAGÉ, à dessein : le cluster, Cloud SQL, et les objets d'échelle
# cluster (RuntimeClass gvisor, StorageClass). L'isolation visée porte sur la
# RELEASE, pas sur l'infrastructure — dupliquer la base coûterait cher et ne
# rendrait pas la preuve plus vraie.
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
BASE_REWRITTEN="$(mktemp -t values-isolated-base-XXXXXX.yaml)"
OVERRIDES="$(mktemp -t values-isolated-over-XXXXXX.yaml)"
trap 'rm -f "$BASE_REWRITTEN" "$OVERRIDES"' EXIT

# DEUX RÉÉCRITURES, ET LA SECONDE EST CELLE QU'ON OUBLIE.
#
# (a) Les noms de service in-cluster. Uniquement ceux de la plateforme
#     (`vibecore-vibecore-platform-<x>.vibecore.svc`) : un `s|\.vibecore\.svc|…|g`
#     général — ce que faisait ce script — déplaçait aussi les doubles in-cluster
#     (`email-sink.vibecore.svc`), qui ne portent pas le nom de la release.
#
# (b) Les NOMS DE DOMAINE PUBLICS. Surcharger `global.*Domain` ne suffit pas : le
#     chart en dérive ses Ingress, mais plusieurs valeurs de `platformEnv` répètent
#     ces domaines en dur, et le chart ne les recalcule pas. Constaté en exécutant :
#       * `screenshotterAllowedHosts` gardait `preview.<ip>` alors que la release
#         isolée sert `preview-<release>.<ip>` -> le screenshotter a REFUSÉ la
#         capture (403 en 7 ms). C'est la garde SSRF qui a bien fonctionné, sur une
#         configuration que j'avais laissée incohérente.
#       * `publicApiBaseUrl` et `runtime.apiBaseUrl` gardaient l'api PARTAGÉE : les
#         clients de la release isolée auraient appelé l'autre release. Silencieux,
#         celui-là, parce que le rejeu passe par les Services in-cluster.
#     On remplace donc chaque domaine partout, en le DÉRIVANT des valeurs de base
#     (aucun domaine codé ici) : `<label>.<reste>` devient `<label>-<release>.<reste>`.
DOMAIN_KEYS='appDomain apiDomain marketingDomain workspaceManagerDomain previewDomain'
sed_args=(-E -e "s|vibecore-vibecore-platform-([a-z-]+)\.vibecore\.svc|${RELEASE}-vibecore-platform-\1.${NS}.svc|g")
olds=()
for key in $DOMAIN_KEYS; do
  old="$(sed -n "s/^  ${key}: *//p" "$BASE_VALUES" | head -1 | tr -d "'\"")"
  [[ -n "$old" ]] || continue
  new="$(printf '%s' "$old" | sed -E "s|^([a-z0-9]+)\.|\1-${RELEASE}.|")"
  olds+=("$old")
  sed_args+=(-e "s|${old}|${new}|g")
  printf '    %-24s %s -> %s\n' "$key" "$old" "$new"
done

sed "${sed_args[@]}" "$BASE_VALUES" > "$BASE_REWRITTEN"

# Contrôles : plus rien ne doit désigner la release partagée, ni par service
# in-cluster, ni par domaine public.
if grep -qE 'vibecore-vibecore-platform-[a-z-]+\.vibecore\.svc' "$BASE_REWRITTEN"; then
  echo "REFUS: des URL in-cluster pointent encore la release PARTAGEE :" >&2
  grep -nE 'vibecore-vibecore-platform-[a-z-]+\.vibecore\.svc' "$BASE_REWRITTEN" >&2
  exit 1
fi
for old in "${olds[@]}"; do
  if grep -q "$old" "$BASE_REWRITTEN"; then
    echo "REFUS: le domaine PARTAGE '$old' subsiste dans les valeurs :" >&2
    grep -n "$old" "$BASE_REWRITTEN" >&2
    exit 1
  fi
done

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
# Les domaines ne sont PAS répétés ici : ils viennent de la réécriture (b)
# ci-dessus, qui les traite partout à la fois. Deux sources de vérité pour la même
# valeur, c'est précisément comment `screenshotterAllowedHosts` s'est retrouvé
# désaccordé de `previewDomain`.
#
# RÉPLIQUES RÉDUITES SUR LES TIERS QUE LES PORTES NE TRAVERSENT PAS. Le cluster
# d'audit a deux nœuds applicatifs (3920m chacun) et fait tourner DEUX releases
# complètes : ils étaient à 97-98 % de CPU demandé, et comme les Deployments sont en
# `maxUnavailable: 0`, la mise à jour progressive ne pouvait plus créer le nouveau
# pod du screenshotter — il restait `Pending` (`Insufficient cpu`, autoscaler au max
# de son pool), donc l'ancien ne partait jamais et le rollout expirait.
#
# `preview-proxy` garde ses DEUX répliques : le rejeu lit les drapeaux dans CHAQUE
# pod du proxy, et cette assertion perd de sa valeur avec un seul. `api` et `web`
# passent à une seule — aucune porte ne teste leur redondance.
cat > "$OVERRIDES" <<YAML
# --- surcharges propres a la release isolee (ecrites par deploy-isolated.sh) ---
services:
  api:
    replicas: 1
  web:
    replicas: 1
platformEnv:
  runtime:
    # Namespace de runtime DÉDIÉE : le workspace-manager de la release partagée ne
    # doit pas ramasser (GC) les workspaces de cette preuve, ni l'inverse.
    workspaceRuntimeNamespace: '${RUNTIME_NS}'
YAML

# --- 2. namespaces, avec les marqueurs d'adoption Helm ----------------------
audit_env_ensure_namespace "$NS" "$RELEASE"

# --- 3. les doubles in-cluster, dans LA namespace de la release isolée -------
# Redis et le puits e-mail sont des doubles de l'environnement d'audit, pas de
# l'infrastructure partagée. Chaque release a les siens : deux releases sur le même
# Redis partageraient les files BullMQ et le pub/sub de collaboration, donc le
# workspace-manager partagé pourrait ramasser les travaux de cette preuve.
#
# Et de toute façon c'est impossible : `allow-intra-namespace-platform` n'ouvre le
# trafic pod-à-pod QUE dans la namespace, donc un `REDIS_URL` traversant les
# namespaces est jeté par `deny-all-default`. Observé : la sonde de readiness de
# l'api rendait 503 sur `connect ETIMEDOUT` et le rollout expirait, tous les autres
# tiers étant sains.
echo "==> doubles in-cluster (Redis + puits e-mail) dans $NS"
audit_kubectl -n "$NS" apply -f "$HERE/manifests/in-cluster-doubles.yaml" >/dev/null
audit_kubectl -n "$NS" rollout status deploy/vibecore-redis --timeout=180s
audit_kubectl -n "$NS" rollout status deploy/email-sink --timeout=180s

# --- 4. le Secret plateforme, recopié depuis la release partagée -------------
# Même base Cloud SQL — ça, c'est de l'infrastructure, légitimement partagée. Seul
# `REDIS_URL` est réécrit vers le double local (voir ci-dessus). Les clés sensibles
# ne transitent pas par le disque local : tout se fait par un tube entre deux appels
# kubectl épinglés, et la réécriture est faite en mémoire dans ce tube.
echo "==> copie du Secret $SECRET_NAME vers $NS (REDIS_URL redirige vers le double local)"
audit_kubectl -n "$SHARED_SECRET_NS" get secret "$SECRET_NAME" -o json |
  python3 -c '
import base64, json, sys

ns = sys.argv[1]
d = json.load(sys.stdin)
d["metadata"] = {"name": d["metadata"]["name"], "namespace": ns}

# Redis suit la release. On remplace la namespace DANS le nom DNS, sans jamais
# afficher la valeur (elle porte le mot de passe).
key = "REDIS_URL"
if key in d.get("data", {}):
    url = base64.b64decode(d["data"][key]).decode()
    fixed = url.replace("vibecore-redis.vibecore.svc", f"vibecore-redis.{ns}.svc")
    if fixed == url:
        print(f"REFUS: {key} ne designe pas vibecore-redis.vibecore.svc", file=sys.stderr)
        raise SystemExit(1)
    d["data"][key] = base64.b64encode(fixed.encode()).decode()
else:
    print(f"REFUS: {key} absent du Secret partage", file=sys.stderr)
    raise SystemExit(1)

json.dump(d, sys.stdout)
' "$NS" |
  audit_kubectl -n "$NS" apply -f - >/dev/null

# --- 5. runtime des workspaces dans SA namespace ---------------------------
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

# --- 6. la plateforme -------------------------------------------------------
echo "==> helm upgrade --install $RELEASE (ns $NS)"
audit_helm upgrade --install "$RELEASE" "$REPO/infra/helm/platform" \
  --namespace "$NS" \
  -f "$REPO/infra/helm/platform/values.yaml" \
  -f "$BASE_REWRITTEN" \
  -f "$OVERRIDES" \
  --set global.imageTag="$TAG" \
  --set platformEnv.runtime.workspaceAgentImage="$REGISTRY/workspace-agent:sha-$TAG" \
  --force-conflicts \
  --timeout 15m
#
# `--force-conflicts` : à la RÉ-application, l'autoscaler vertical de GKE s'est
# approprié `.spec.replicas` du workspace-manager via le sous-ressource `scale` —
# vérifié dans `managedFields` :
#
#   helm:
#   vpa-recommender:scale        <- proprietaire de .spec.replicas
#   kube-controller-manager:status
#
# Sans le drapeau, l'apply côté serveur refuse (« conflict with vpa-recommender »)
# et l'upgrade échoue. Ici Helm doit rester propriétaire du champ : le rejeu
# AFFIRME le nombre de répliques traversées par les portes, donc une preuve dont un
# autre contrôleur peut changer la topologie sous elle ne vaut rien. Le drapeau est
# limité à cette release de preuve — il n'est pas ajouté au CD.

for comp in api preview-proxy workspace-manager screenshotter; do
  audit_kubectl -n "$NS" rollout status "deploy/$RELEASE-vibecore-platform-$comp" --timeout=420s
done

# --- 7. VÉRIFICATION DES DIGESTS -------------------------------------------
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

  # « Je n'ai pas pu savoir » n'est PAS « il n'y a rien ». Un `TLS handshake
  # timeout` du plan de contrôle — observé une fois ici — rendait une sortie vide
  # que la boucle rapportait comme « aucun pod » : refus, donc dans le bon sens,
  # mais sur un motif faux, et le même raccourci ailleurs donnerait un vert à tort.
  # On distingue donc les trois cas, avec deux tentatives supplémentaires avant de
  # conclure, et un état INDETERMINE explicite qui refuse (même vocabulaire que la
  # vérification de teardown de down.sh).
  #
  # Boucle `read` et pas `mapfile` : le bash livré par macOS est en 3.2, où
  # `mapfile` n'existe pas — le script s'y arrêtait sur « command not found » juste
  # avant de vérifier quoi que ce soit.
  raw=''
  rc=1
  for essai in 1 2 3; do
    if raw="$(audit_kubectl -n "$NS" get pods \
      -l "app.kubernetes.io/component=$comp" \
      -o jsonpath='{range .items[*]}{.status.containerStatuses[0].imageID}{"\n"}{end}' 2>/dev/null)"; then
      rc=0
      break
    fi
    sleep $((essai * 5))
  done

  if ((rc != 0)); then
    printf '  %-20s INDETERMINE (interrogation du cluster en echec apres 3 tentatives)\n' "$comp"
    ecarts=$((ecarts + 1))
    continue
  fi

  got=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && got+=("$line")
  done < <(printf '%s\n' "$raw" | sed 's/.*@//' | sort -u)

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
