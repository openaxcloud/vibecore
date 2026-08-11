#!/usr/bin/env bash
# Test de régression : la cible VALIDÉE doit être la cible UTILISÉE.
#
# Le défaut que ce test verrouille : les scripts validaient le contexte kubectl
# courant, puis appelaient helm sans `--kube-context`. Helm résout sa cible via
# ses variables d'environnement AVANT le contexte courant, donc
# `HELM_KUBECONTEXT=<prod>` faisait passer la garde sur l'audit et exécutait les
# `helm upgrade` contre la PRODUCTION.
#
# Ce test est HERMÉTIQUE : il n'appelle ni le vrai helm ni le vrai kubectl, il
# les remplace par des faux qui ENREGISTRENT la cible effectivement reçue. Il
# tourne donc partout, sans cluster, sans credentials — et surtout il ne peut pas
# muter quoi que ce soit. Ce qu'il vérifie est la seule chose qui compte : quelle
# cible arrive à l'outil.
#
# Il ÉCHOUE sur la version d'avant le correctif (appels nus → la cible vient de
# l'environnement) et PASSE après (la cible est passée explicitement).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT_CTX='gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster'
PROD_CTX='connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
LOG="$TMP/calls.log"
: > "$LOG"

# --- faux helm / kubectl : ils journalisent la cible reçue ------------------
# La cible est `--kube-context`/`--context` si présent, sinon $HELM_KUBECONTEXT,
# sinon « AMBIANT » — exactement l'ordre de résolution réel de Helm.
cat > "$TMP/bin/helm" <<'FAKE'
#!/usr/bin/env bash
target="AMBIANT"
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    --kube-context) j=$((i+1)); target="${!j}" ;;
    --kube-context=*) target="${!i#--kube-context=}" ;;
  esac
done
if [[ "$target" == "AMBIANT" && -n "${HELM_KUBECONTEXT:-}" ]]; then
  target="$HELM_KUBECONTEXT"
fi
# `helm repo …` n'atteint AUCUN cluster : il ecrit ~/.config/helm/repositories.yaml.
# Meme exemption que scripts/audit-env/check-pinned-context.mjs, meme raison : il
# n'y a pas de cible cluster a epingler sur une commande purement locale.
case " $* " in
  *" repo "*) ;;
  *) echo "helm|$target|$*" >> "$FAKE_CALL_LOG" ;;
esac
# Réponses minimales pour que les scripts avancent.
case "${1:-}" in
  list|history|status) echo '[]' ;;
esac
exit 0
FAKE

cat > "$TMP/bin/kubectl" <<'FAKE'
#!/usr/bin/env bash
# Cible = --context si present, sinon AMBIANT (kubectl ne lit pas HELM_*).
target="AMBIANT"
for ((i=1; i<=$#; i++)); do
  case "${!i}" in
    --context) j=$((i+1)); target="${!j}" ;;
    --context=*) target="${!i#--context=}" ;;
  esac
done

# Tout est decide sur la chaine COMPLETE des arguments : les enveloppes
# prefixent --context=..., et `-n <ns>` decale les positions, donc raisonner sur
# $1/$2 est faux (c'est ce qui faisait boucler ce test).
all=" $* "

# `kubectl config …` n'atteint AUCUN cluster : il lit/ecrit le kubeconfig, deja
# epingle par audit_env_pin_cluster_target. Pas compte comme « ambiant ».
case "$all" in
  *" config "*) ;;
  *) echo "kubectl|$target|$*" >> "$FAKE_CALL_LOG" ;;
esac

# Motifs CONTIGUS : `*" config "*" get-contexts "*` ne matche pas
# « config get-contexts », le premier motif consommant l'espace partage.
case "$all" in
  *"config get-contexts"*)
    echo 'gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster'
    echo 'connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'
    ;;
  *"config view"*) echo 'https://10.0.0.1' ;;
  *"get nodes"*) echo 'gce://vibecore-audit-test-20260807/europe-west9-a/gke-node-1' ;;
  # IP du load balancer : sans elle addons.sh attend 10 minutes.
  *"get svc"*) echo '203.0.113.10' ;;
esac
exit 0
FAKE

cat > "$TMP/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
# Faux gcloud : repond ce que la garde d'identite attend pour l'ENV D'AUDIT.
# Il n'atteint aucune API. Le test porte sur la cible passee a helm/kubectl, pas
# sur la garde d'identite (deja prouvee en reel ailleurs).
args="$*"
case "$args" in
  *"projects describe"*) echo 'env=audit-test;ephemeral=true;owner=platform-audit' ;;
  *"clusters describe"*"resourceLabels"*) echo 'env=audit-test;ephemeral=true' ;;
  *"clusters describe"*"endpoint"*) echo '10.0.0.1' ;;
  *) : ;;
esac
exit 0
FAKE

# `helm repo` est local (il ecrit ~/.config/helm) : le faux helm l'absorbe.
chmod +x "$TMP/bin/helm" "$TMP/bin/kubectl" "$TMP/bin/gcloud"

fail=0
note() { printf '  %s\n' "$*"; }

# --- le scénario de l'expert : environnement hostile ------------------------
run_case() {
  local label="$1"; shift
  : > "$LOG"
  (
    export FAKE_CALL_LOG="$LOG"
    export PATH="$TMP/bin:$PATH"
    export HOME="$TMP"          # kubeconfig épinglé sous un HOME jetable
    mkdir -p "$TMP/.kube"; : > "$TMP/.kube/config"
    "$@" > "$TMP/script.out" 2>&1
  ) || true

  local ambient prod audit
  ambient="$(grep -c '|AMBIANT|' "$LOG" || true)"
  prod="$(grep -c "|$PROD_CTX|" "$LOG" || true)"
  audit="$(grep -c "|$AUDIT_CTX|" "$LOG" || true)"

  note "$label"
  note "    --- cibles enregistrees ---"
  sed 's/^/      /' "$LOG"
  note "    --- fin ---"
  if [[ -n "${AUDIT_TEST_VERBOSE:-}" ]]; then
    note "    --- sortie du script ---"
    sed 's/^/      /' "$TMP/script.out" | tail -20
  fi
  note "    appels vers l'audit : $audit"
  note "    appels AMBIANTS (cible choisie par l'environnement) : $ambient"
  note "    appels vers la PROD : $prod"

  if [[ "$ambient" != "0" ]]; then
    note "    ECHEC: un appel laisse l'environnement choisir la cible"
    grep '|AMBIANT|' "$LOG" | head -3 | sed 's/^/      /'
    fail=1
  fi

  if [[ "$prod" != "0" ]]; then
    note "    ECHEC: un appel vise la PRODUCTION"
    grep "|$PROD_CTX|" "$LOG" | head -3 | sed 's/^/      /'
    fail=1
  fi

  if [[ "$audit" == "0" ]]; then
    note "    ECHEC: aucun appel vers l'audit (le script n'a rien fait ?)"
    fail=1
  fi
}

echo "=== Test de regression : cible validee == cible utilisee ==="
echo

# `HELM_KUBECONTEXT` pointe sur la PROD. Le script doit malgré tout ne parler
# qu'à l'audit (ou refuser), jamais à la prod, jamais en « ambiant ».
HELM_KUBECONTEXT="$PROD_CTX" \
HELM_NAMESPACE='vibecore' \
  run_case "environnement hostile: HELM_KUBECONTEXT=<prod>, HELM_NAMESPACE=vibecore" \
  bash "$HERE/addons.sh"

echo
if [[ "$fail" == "0" ]]; then
  echo "OK: aucune cible ambiante, aucune cible prod — l'environnement ne choisit plus."
else
  echo "ECHEC: la cible utilisee ne suit pas la cible validee." >&2
fi

exit "$fail"
