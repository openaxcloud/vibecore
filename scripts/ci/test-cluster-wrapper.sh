#!/usr/bin/env bash
# Test de régression de scripts/ci/cluster.sh — DEUX défauts, deux familles de cas.
#
# FAMILLE A — la PORTÉE d'un `unset`. deploy-main.yml neutralisait `HELM_*` dans son
# étape de credentials ; un `unset` ne franchit pas la frontière d'une étape, et
# `--kube-context` ne couvre pas `HELM_KUBEAPISERVER`, qui contourne le kubeconfig
# entièrement. Le cas TÉMOIN reproduit l'ancien appel et DOIT montrer la redirection :
# sans lui, rien ne prouve que le test mesure quelque chose.
#
# FAMILLE B — une SOUS-CHAÎNE n'est pas une identité. Les trois cas négatifs sont
# ceux rapportés au contre-audit, à l'identique :
#   B1. `prod-gateway` acceptait un AUTRE projet Connect Gateway de même membership ;
#   B2. `prod-direct` acceptait un apiserver arbitraire dès que le NOM du contexte
#       contenait `vibecore-495216` ;
#   B3. `staging` acceptait un apiserver arbitraire échappant à sa deny-list.
# Chacun doit maintenant REFUSER **avant** d'atteindre l'outil — et le test le vérifie
# en comptant les appels enregistrés par le faux Helm, pas seulement le code de sortie.
#
# HERMÉTIQUE : faux helm / kubectl / gcloud. Aucun cluster, aucun credential, aucune
# mutation possible. Les identités « autoritatives » sont servies par le faux gcloud,
# donc le test vérifie la LOGIQUE de comparaison, pas l'état réel de GCP.
# Les exports sont VOLONTAIREMENT locaux a chaque sous-shell : un cas ne doit pas
# contaminer le suivant. SC2030/SC2031 decrivent precisement cette isolation.
# shellcheck disable=SC2030,SC2031
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Identités RÉELLES de la prod (allow-list de cluster.sh).
PROD_PROJECT='vibecore-495216'
PROD_NUMBER='267592214411'
PROD_LOCATION='europe-west9'
PROD_CLUSTER='vibecore-prod-app'
GW_CTX="connectgateway_${PROD_PROJECT}_${PROD_LOCATION}_${PROD_CLUSTER}"
DIRECT_CTX="gke_${PROD_PROJECT}_${PROD_LOCATION}_${PROD_CLUSTER}"
GW_SERVER="https://${PROD_LOCATION}-connectgateway.googleapis.com/v1/projects/${PROD_NUMBER}/locations/${PROD_LOCATION}/gkeMemberships/${PROD_CLUSTER}"
PROD_ENDPOINT='34.155.5.126'
HOSTILE_APISERVER='https://apiserver-hostile.example.com'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
LOG="$TMP/calls.log"

cat > "$TMP/bin/helm" <<'FAKE'
#!/usr/bin/env bash
# Ordre de resolution REEL de Helm : HELM_KUBEAPISERVER court-circuite le
# kubeconfig (donc --kube-context), sinon HELM_KUBECONTEXT, sinon --kube-context.
target="AUCUNE"
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    --kube-context=*) target="${!i#--kube-context=}" ;;
  esac
done
if [[ -n "${HELM_KUBECONTEXT:-}" ]]; then
  target="$HELM_KUBECONTEXT"
fi
if [[ -n "${HELM_KUBEAPISERVER:-}" ]]; then
  target="APISERVER:${HELM_KUBEAPISERVER}"
fi
echo "helm|$target|$*" >> "$FAKE_CALL_LOG"
exit 0
FAKE

# Faux kubectl : sert le kubeconfig. $FAKE_SERVER simule un kubeconfig SUBSTITUE,
# $FAKE_CURRENT_CONTEXT un contexte courant arbitraire.
cat > "$TMP/bin/kubectl" <<FAKE
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *"current-context"*) echo "\${FAKE_CURRENT_CONTEXT:-$GW_CTX}" ;;
  *"contexts["*) echo 'cluster-vu-dans-le-kubeconfig' ;;
  *"clusters["*) echo "\${FAKE_SERVER:-$GW_SERVER}" ;;
  *) echo "kubectl|\$args" >> "\$FAKE_CALL_LOG" ;;
esac
exit 0
FAKE

# Faux gcloud : l'AUTORITE d'identite. Par defaut il decrit la vraie prod ;
# \$FAKE_MEMBERSHIP et \$FAKE_ENDPOINT permettent de simuler un homonyme dans un
# autre projet, ou un endpoint different.
cat > "$TMP/bin/gcloud" <<FAKE
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *"projects describe"*) echo "\${FAKE_PROJECT_NUMBER:-$PROD_NUMBER}" ;;
  *"memberships describe"*) echo "\${FAKE_MEMBERSHIP:-projects/$PROD_PROJECT/locations/$PROD_LOCATION/memberships/$PROD_CLUSTER}" ;;
  *"clusters describe"*) echo "\${FAKE_ENDPOINT:-$PROD_ENDPOINT}" ;;
  *) : ;;
esac
exit 0
FAKE

chmod +x "$TMP/bin/helm" "$TMP/bin/kubectl" "$TMP/bin/gcloud"

fail=0
note() { printf '  %s\n' "$*"; }

# `refus <libelle> <env…> -- <args cluster.sh…>` : exige un exit non nul ET zero
# appel a l'outil. Un refus qui laisse l'outil s'executer n'est pas un refus.
refus() {
  local label="$1"; shift
  : > "$LOG"
  local out="$TMP/out.txt" rc
  (
    export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
    while [[ "$1" != "--" ]]; do export "${1?}"; shift; done
    shift
    "$HERE/cluster.sh" "$@"
  ) > "$out" 2>&1
  rc=$?

  local appels
  appels="$(grep -c '^helm|\|^kubectl|' "$LOG" 2>/dev/null || true)"

  if [[ "$rc" == "0" || "$appels" != "0" ]]; then
    note "ECHEC $label -> exit=$rc, appels a l'outil=$appels (attendu: exit!=0 et 0 appel)"
    sed 's/^/        /' "$LOG" | head -3
    fail=1
  else
    note "OK    $label -> $(grep -m1 REFUS "$out" | cut -c1-118)"
  fi
}

echo "=== A. TEMOIN — ancien appel: --kube-context, sans enveloppe ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export HELM_KUBEAPISERVER="$HOSTILE_APISERVER" HELM_KUBETOKEN='jeton-hostile'
  helm --kube-context="$GW_CTX" upgrade vibecore infra/helm/platform
) || true
if ! grep -q "APISERVER:${HOSTILE_APISERVER}" "$LOG"; then
  note "ECHEC: le temoin ne reproduit pas la redirection — le test ne mesure rien."
  fail=1
else
  note "OK: redirection reproduite (cible recue = $(cut -d'|' -f2 "$LOG"))"
fi

echo
echo "=== A2. AVEC l'enveloppe, meme environnement hostile ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export HELM_KUBEAPISERVER="$HOSTILE_APISERVER" HELM_KUBETOKEN='jeton-hostile'
  export HELM_KUBECONTEXT='gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster'
  export PROD_KUBE_CONTEXT="$GW_CTX"
  "$HERE/cluster.sh" prod-gateway helm upgrade vibecore infra/helm/platform
) > "$TMP/a2.out" 2>&1 || true
if ! grep -qx "helm|${GW_CTX}|--kube-context=${GW_CTX} upgrade vibecore infra/helm/platform" "$LOG"; then
  note "ECHEC: la cible n'est pas le contexte de prod epingle."
  sed 's/^/        /' "$LOG"
  fail=1
elif grep -q 'jeton-hostile' "$TMP/a2.out"; then
  note "ECHEC: la valeur d'un jeton a ete journalisee."
  fail=1
else
  note "OK: environnement neutralise, cible nommee, aucune valeur de jeton journalisee."
fi

echo
echo "=== B1. prod-gateway : AUTRE projet Connect Gateway, meme nom de membership ==="
# Le nom `vibecore-prod-app` est un LIBELLE : un autre projet peut en avoir un.
# L'URL presentee est un Connect Gateway parfaitement bien forme, mais du projet 999.
refus "B1 autre projet, membership homonyme" \
  "PROD_KUBE_CONTEXT=$GW_CTX" \
  "FAKE_SERVER=https://${PROD_LOCATION}-connectgateway.googleapis.com/v1/projects/999999999999/locations/${PROD_LOCATION}/gkeMemberships/${PROD_CLUSTER}" \
  -- prod-gateway helm upgrade vibecore infra/helm/platform

echo
echo "=== B2. prod-direct : apiserver arbitraire, nom de contexte contenant l'id prod ==="
# Exactement le contournement rapporte : le nom du contexte est une chaine libre.
refus "B2 nom de contexte trompeur" \
  "FAKE_CURRENT_CONTEXT=gke_vibecore-495216_europe-west9_cluster-de-l-attaquant" \
  "FAKE_SERVER=$HOSTILE_APISERVER" \
  -- prod-direct helm upgrade --install vibecore infra/helm/platform

echo
echo "=== B2b. prod-direct : bon nom de contexte, mais apiserver != endpoint autoritatif ==="
refus "B2b apiserver substitue" \
  "FAKE_CURRENT_CONTEXT=$DIRECT_CTX" \
  "FAKE_SERVER=$HOSTILE_APISERVER" \
  -- prod-direct helm upgrade --install vibecore infra/helm/platform

echo
echo "=== B3. staging : apiserver arbitraire echappant a l'ancienne deny-list ==="
refus "B3 staging non epingle" \
  "FAKE_CURRENT_CONTEXT=gke_projet-quelconque_europe-west1_grappe-anodine" \
  "FAKE_SERVER=$HOSTILE_APISERVER" \
  -- staging helm upgrade --install vibecore infra/helm/platform

echo
echo "=== C. prod-gateway : membership homonyme dans un autre projet (vu par Fleet) ==="
refus "C identite de membership d'un autre projet" \
  "PROD_KUBE_CONTEXT=$GW_CTX" \
  "FAKE_MEMBERSHIP=projects/projet-tiers/locations/${PROD_LOCATION}/memberships/${PROD_CLUSTER}" \
  -- prod-gateway helm upgrade vibecore infra/helm/platform

echo
echo "=== D. numero de projet qui ne correspond pas a l'id ==="
refus "D numero de projet different" \
  "PROD_KUBE_CONTEXT=$GW_CTX" \
  "FAKE_PROJECT_NUMBER=111111111111" \
  -- prod-gateway helm upgrade vibecore infra/helm/platform

echo
echo "=== E. cas LEGITIMES — ce n'est pas un « tout refuser » ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export PROD_KUBE_CONTEXT="$GW_CTX"
  "$HERE/cluster.sh" prod-gateway kubectl -n vibecore rollout status deploy/api
) > "$TMP/e1.out" 2>&1
rc1=$?
: > "$TMP/log2"
(
  export FAKE_CALL_LOG="$TMP/log2" PATH="$TMP/bin:$PATH"
  export FAKE_CURRENT_CONTEXT="$DIRECT_CTX" FAKE_SERVER="https://$PROD_ENDPOINT"
  "$HERE/cluster.sh" prod-direct helm history vibecore -n vibecore
) > "$TMP/e2.out" 2>&1
rc2=$?

if [[ "$rc1" != "0" ]] || ! grep -q "context=${GW_CTX}" "$LOG"; then
  note "ECHEC: l'appel legitime prod-gateway ne passe plus."
  sed 's/^/        /' "$TMP/e1.out"
  fail=1
else
  note "OK    prod-gateway legitime -> $(grep '^kubectl|' "$LOG" | head -1 | cut -c1-90)"
fi

if [[ "$rc2" != "0" ]] || ! grep -q "kube-context=${DIRECT_CTX}" "$TMP/log2"; then
  note "ECHEC: l'appel legitime prod-direct ne passe plus."
  sed 's/^/        /' "$TMP/e2.out"
  fail=1
else
  note "OK    prod-direct legitime  -> $(grep '^helm|' "$TMP/log2" | head -1 | cut -c1-90)"
fi

echo
if [[ "$fail" == "0" ]]; then
  echo "OK: l'environnement ne choisit plus la cible, et une sous-chaine ne vaut plus identite."
else
  echo "ECHEC: l'enveloppe ne tient pas ses proprietes." >&2
fi

exit "$fail"
