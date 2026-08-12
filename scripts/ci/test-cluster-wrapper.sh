#!/usr/bin/env bash
# Test de régression : `HELM_KUBEAPISERVER` ne doit plus pouvoir rediriger un
# `helm upgrade` de production.
#
# Le défaut : deploy-main.yml faisait `unset HELM_*` dans son étape de credentials,
# et un `unset` ne franchit pas la frontière d'une étape — chaque `run:` est un
# shell neuf. Les étapes suivantes repartaient donc avec l'environnement intact, et
# `--kube-context` ne les couvre pas : `HELM_KUBEAPISERVER` (+ `HELM_KUBETOKEN`)
# contourne le kubeconfig ENTIÈREMENT, donc le contexte nommé n'est plus consulté.
#
# HERMÉTIQUE : faux helm / kubectl qui ENREGISTRENT la cible réellement reçue.
# Aucun cluster, aucun credential, aucune mutation possible.
#
# Le cas TÉMOIN (A) reproduit l'ancien appel, avec `--kube-context` mais sans
# enveloppe : il DOIT montrer la redirection. Sans lui, rien ne prouve que le test
# mesure quelque chose.
# Les exports sont VOLONTAIREMENT locaux a chaque sous-shell : un cas ne doit pas
# contaminer le suivant. SC2030/SC2031 decrivent precisement cette isolation.
# shellcheck disable=SC2030,SC2031
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROD_CTX='connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'
PROD_SERVER='https://connectgateway.googleapis.com/v1/projects/123456789/locations/global/gkeMemberships/vibecore-prod-app'
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

# Faux kubectl : sert le kubeconfig demande par l'enveloppe. $FAKE_SERVER permet
# de simuler un kubeconfig SUBSTITUE (bon nom de contexte, mauvais apiserver).
cat > "$TMP/bin/kubectl" <<FAKE
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *"current-context"*) echo "\${FAKE_CURRENT_CONTEXT:-$PROD_CTX}" ;;
  *"contexts["*) echo 'cluster-de-prod' ;;
  *"clusters["*) echo "\${FAKE_SERVER:-$PROD_SERVER}" ;;
  *) echo "kubectl|\$args" >> "\$FAKE_CALL_LOG" ;;
esac
exit 0
FAKE

chmod +x "$TMP/bin/helm" "$TMP/bin/kubectl"

fail=0
note() { printf '  %s\n' "$*"; }

echo "=== A. TEMOIN — ancien appel: --kube-context, sans enveloppe ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export HELM_KUBEAPISERVER="$HOSTILE_APISERVER" HELM_KUBETOKEN='jeton-hostile'
  helm --kube-context="$PROD_CTX" upgrade vibecore infra/helm/platform
) || true
note "cible recue : $(cut -d'|' -f2 "$LOG")"
if ! grep -q "APISERVER:${HOSTILE_APISERVER}" "$LOG"; then
  note "ECHEC: le temoin ne reproduit pas la redirection — le test ne mesure rien."
  fail=1
else
  note "OK: la redirection est bien reproduite (c'est le defaut a fermer)."
fi

echo
echo "=== B. AVEC l'enveloppe, meme environnement hostile ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export HELM_KUBEAPISERVER="$HOSTILE_APISERVER" HELM_KUBETOKEN='jeton-hostile'
  export HELM_KUBECONTEXT='gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster'
  export PROD_KUBE_CONTEXT="$PROD_CTX"
  "$HERE/cluster.sh" prod-gateway helm upgrade vibecore infra/helm/platform
) > "$TMP/b.out" 2>&1 || true
note "cible recue : $(cut -d'|' -f2 "$LOG")"
if ! grep -qx "helm|${PROD_CTX}|--kube-context=${PROD_CTX} upgrade vibecore infra/helm/platform" "$LOG"; then
  note "ECHEC: la cible n'est pas le contexte de prod epingle."
  sed 's/^/      /' "$LOG"
  fail=1
fi
if grep -q 'jeton-hostile' "$TMP/b.out"; then
  note "ECHEC: la valeur d'un jeton a ete journalisee."
  fail=1
fi
[[ "$fail" == "0" ]] && note "OK: environnement neutralise, cible nommee, aucune valeur journalisee."

echo
echo "=== C. kubeconfig SUBSTITUE (bon nom de contexte, autre apiserver) -> refus ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export PROD_KUBE_CONTEXT="$PROD_CTX"
  export FAKE_SERVER='https://apiserver-substitue.example.com'
  "$HERE/cluster.sh" prod-gateway helm upgrade vibecore infra/helm/platform
) > "$TMP/c.out" 2>&1
rc=$?
note "exit=$rc, appels helm enregistres: $(grep -c '^helm|' "$LOG" || true)"
if [[ "$rc" == "0" ]] || [[ "$(grep -c '^helm|' "$LOG" || true)" != "0" ]]; then
  note "ECHEC: l'enveloppe a agi sur un apiserver non verifie."
  fail=1
else
  note "OK: refus avant tout appel — $(grep -m1 REFUS "$TMP/c.out")"
fi

echo
echo "=== D. un deploiement STAGING ne peut pas viser la prod -> refus ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export FAKE_CURRENT_CONTEXT="$PROD_CTX"
  "$HERE/cluster.sh" staging helm upgrade --install vibecore infra/helm/platform
) > "$TMP/d.out" 2>&1
rc=$?
note "exit=$rc, appels helm enregistres: $(grep -c '^helm|' "$LOG" || true)"
if [[ "$rc" == "0" ]] || [[ "$(grep -c '^helm|' "$LOG" || true)" != "0" ]]; then
  note "ECHEC: un chemin staging a pu viser la production."
  fail=1
else
  note "OK: refus — $(grep -m1 REFUS "$TMP/d.out")"
fi

echo
echo "=== E. cas legitime: prod-gateway passe bien (pas un 'tout refuser') ==="
: > "$LOG"
(
  export FAKE_CALL_LOG="$LOG" PATH="$TMP/bin:$PATH"
  export PROD_KUBE_CONTEXT="$PROD_CTX"
  "$HERE/cluster.sh" prod-gateway kubectl -n vibecore rollout status deploy/api
) > "$TMP/e.out" 2>&1
rc=$?
note "exit=$rc"
if [[ "$rc" != "0" ]] || ! grep -q "context=${PROD_CTX}" "$LOG"; then
  note "ECHEC: l'appel legitime ne passe plus."
  sed 's/^/      /' "$TMP/e.out"
  fail=1
else
  note "OK: $(grep '^kubectl|' "$LOG" | head -1)"
fi

echo
if [[ "$fail" == "0" ]]; then
  echo "OK: l'environnement ne choisit plus la cible d'un helm/kubectl de CI."
else
  echo "ECHEC: l'enveloppe ne tient pas ses proprietes." >&2
fi

exit "$fail"
