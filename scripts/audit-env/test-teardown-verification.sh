#!/usr/bin/env bash
# Test de régression : une ERREUR D'API n'est pas une PREUVE D'ABSENCE.
#
# Le défaut que ce test verrouille : la phase [3/3] de down.sh écrivait
# `gcloud … 2>/dev/null || echo 'GONE'` et `gcloud … 2>/dev/null || true`. Toute
# panne de lecture — jeton expiré, quota, réseau, API désactivée — se traduisait
# donc par « projet GONE, 0 cluster, 0 instance SQL, 0 VM, 0 bucket », c'est-à-dire
# par le rapport « TEARDOWN VERIFIE » et un exit 0, alors que l'infrastructure
# pouvait tourner et facturer intégralement. La vérification affirmait le
# contraire de ce qu'elle avait observé.
#
# HERMÉTIQUE : faux gcloud / terraform / helm / kubectl, aucun appel réseau,
# aucune mutation possible. Deux scénarios :
#   A. les listages ÉCHOUENT alors que le projet est toujours là -> doit ECHOUER
#   B. les listages échouent APRÈS une suppression confirmée   -> doit REUSSIR
# Le second est indispensable : sans lui, « tout refuser » passerait le test tout
# en rendant le teardown inutilisable.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT_CTX='gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/tf" "$TMP/.kube"
: > "$TMP/.kube/config"
: > "$TMP/tf/terraform.tfstate"

cat > "$TMP/bin/kubectl" <<FAKE
#!/usr/bin/env bash
case " \$* " in
  *"config get-contexts"*)
    echo '$AUDIT_CTX'
    # Le contexte de PROD doit exister, sinon le controle d'integrite final de
    # down.sh echoue pour une raison etrangere a ce test.
    echo 'connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'
    ;;
  *"clusters describe"*) echo '10.0.0.1' ;;
  *"get nodes"*) echo 'gce://vibecore-audit-test-20260807/europe-west9-a/gke-node-1' ;;
esac
exit 0
FAKE

cat > "$TMP/bin/helm" <<'FAKE'
#!/usr/bin/env bash
# La release de PROD doit rester LISIBLE, sinon down.sh échoue pour une autre
# raison que celle qu'on teste ici.
echo '[{"name":"vibecore","revision":976,"status":"deployed"}]'
exit 0
FAKE

cat > "$TMP/bin/terraform" <<'FAKE'
#!/usr/bin/env bash
case "$*" in
  *project_id*) echo 'vibecore-audit-test-20260807' ;;
  *cluster_name*) echo 'vibecore-audit-cluster' ;;
  *cluster_zone*) echo 'europe-west9-a' ;;
esac
exit 0
FAKE

# Faux gcloud paramétré par $FAKE_GCLOUD_MODE :
#   listages-en-panne  -> describe OK (projet ACTIVE), tout listage echoue (403)
#   projet-supprime    -> describe dit NOT_FOUND, listages echouent NOT_FOUND
cat > "$TMP/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
args="$*"

case "$args" in
  *"projects describe"*"labels"*) echo 'env=audit-test;ephemeral=true'; exit 0 ;;
  *"projects describe"*)
    if [[ "$FAKE_GCLOUD_MODE" == "projet-supprime" ]]; then
      echo "ERROR: (gcloud.projects.describe) Project 'vibecore-audit-test-20260807' not found or deleted." >&2
      exit 1
    fi
    echo 'ACTIVE'; exit 0 ;;
  *"clusters describe"*) echo 'env=audit-test;ephemeral=true'; exit 0 ;;
  *"clusters list"* | *"instances list"* | *"storage ls"*)
    if [[ "$FAKE_GCLOUD_MODE" == "projet-supprime" ]]; then
      echo "ERROR: (gcloud) Project 'vibecore-audit-test-20260807' was not found." >&2
    else
      echo 'ERROR: (gcloud) PERMISSION_DENIED: Request had insufficient authentication scopes.' >&2
    fi
    exit 1 ;;
esac
exit 0
FAKE

chmod +x "$TMP/bin/kubectl" "$TMP/bin/helm" "$TMP/bin/terraform" "$TMP/bin/gcloud"

fail=0

run() {
  local mode="$1" attendu="$2" rc out
  out="$TMP/out-$mode.txt"
  (
    export PATH="$TMP/bin:$PATH"
    export HOME="$TMP"
    export FAKE_GCLOUD_MODE="$mode"
    export TF_DIR="$TMP/tf"
    export SKIP_PROJECT_DELETE=1
    export PROD_KUBE_CONTEXT='connectgateway_vibecore-495216_europe-west9_vibecore-prod-app'
    bash "$HERE/down.sh"
  ) > "$out" 2>&1
  rc=$?

  echo "  mode=$mode -> exit=$rc (attendu: $attendu)"
  sed -n '/VERIFICATION de la disparition/,$p' "$out" | sed 's/^/      /'

  if [[ "$attendu" == "echec" && "$rc" == "0" ]]; then
    echo "  ECHEC: des listages illisibles ont ete pris pour '0 ressource'." >&2
    fail=1
  fi

  if [[ "$attendu" == "succes" && "$rc" != "0" ]]; then
    echo "  ECHEC: un teardown reellement termine est refuse (fail-closed trop large)." >&2
    fail=1
  fi
}

echo "=== A. listages en panne, projet TOUJOURS present -> doit ECHOUER ==="
run listages-en-panne echec
echo
echo "=== B. listages refuses APRES suppression confirmee -> doit REUSSIR ==="
run projet-supprime succes

echo
if [[ "$fail" == "0" ]]; then
  echo "OK: erreur d'API != ressource absente, et le cas legitime passe toujours."
else
  echo "ECHEC: la verification de teardown tire de mauvaises conclusions." >&2
fi

exit "$fail"
