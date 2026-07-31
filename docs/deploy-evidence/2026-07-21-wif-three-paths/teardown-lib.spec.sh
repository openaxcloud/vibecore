#!/usr/bin/env bash
###############################################################################
# teardown-lib.spec.sh — tests de la logique de teardown WIF FAIL-CLOSED.
#
# Exigence expert RR-08 (5) : un test NÉGATIF qui SIMULE une erreur transitoire de
# `describe` (mock gcloud renvoyant une erreur réseau) et vérifie qu'on TENTE quand
# même la suppression / qu'on échoue FAIL-CLOSED.
#
# Le test installe un FAUX `gcloud` en tête de PATH, piloté par $SC (scénario) :
#   present_then_deleted   describe→ACTIVE puis (après delete) DELETE_REQUESTED
#   transient_persistent   describe→erreur réseau à CHAQUE appel (jamais lisible)
#   transient_then_recover 2 erreurs réseau, puis ACTIVE, puis DELETE_REQUESTED
#   notfound_auth          describe→« not found or permission denied », auth SAINE
#   notfound_auth_broken   describe→not found MAIS auth print-access-token ÉCHOUE
#   perm_denied            describe→PERMISSION_DENIED explicite (projet peut exister)
#   delete_fails_active    describe→ACTIVE en permanence, delete échoue → reste ACTIF
###############################################################################
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/teardown-lib.sh"

# retries courts et sans attente pour le test
export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"; mkdir -p "$BIN"
REC="$TMP/calls.log"; CTR="$TMP/describe.ctr"

# ---- FAUX gcloud ------------------------------------------------------------
cat > "$BIN/gcloud" <<'MOCK'
#!/usr/bin/env bash
REC="${MOCK_REC:?}"; CTR="${MOCK_CTR:?}"; SC="${SC:?}"
echo "$*" >> "$REC"
sub="${1:-} ${2:-}"
case "$sub" in
  "projects describe")
    n=$(( $(cat "$CTR" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$CTR"
    case "$SC" in
      present_then_deleted)
        if [ "$n" -le 1 ]; then echo "ACTIVE"; exit 0; else echo "DELETE_REQUESTED"; exit 0; fi ;;
      transient_persistent)
        echo "ERROR: (gcloud.projects.describe) There was a problem refreshing your current auth tokens: Unable to connect to the network. Check your network settings and try again." >&2; exit 1 ;;
      transient_then_recover)
        if [ "$n" -le 2 ]; then echo "ERROR: (gcloud.projects.describe) Unable to connect to the network: operation timed out" >&2; exit 1
        elif [ "$n" -eq 3 ]; then echo "ACTIVE"; exit 0
        else echo "DELETE_REQUESTED"; exit 0; fi ;;
      notfound_auth|notfound_auth_broken)
        echo "ERROR: (gcloud.projects.describe) Project [x] not found or permission denied. It may not exist." >&2; exit 1 ;;
      perm_denied)
        echo "ERROR: (gcloud.projects.describe) User [me] does not have permission to access projects instance [x]: PERMISSION_DENIED" >&2; exit 1 ;;
      delete_fails_active)
        echo "ACTIVE"; exit 0 ;;
    esac ;;
  "projects delete")
    case "$SC" in
      delete_fails_active) echo "ERROR: could not delete project" >&2; exit 1 ;;
      *) echo "Deleted [https://cloudresourcemanager.googleapis.com/...]."; exit 0 ;;
    esac ;;
  "auth print-access-token")
    case "$SC" in
      notfound_auth_broken) echo "ERROR: reauth required" >&2; exit 1 ;;
      *) echo "ya29.mock-access-token"; exit 0 ;;
    esac ;;
  *) exit 0 ;;   # sous-ressources (clusters/run/artifacts/iam...) : no-op
esac
MOCK
chmod +x "$BIN/gcloud"

run_scenario(){ SC="$1" MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c "$2"; }
reset(){ : > "$REC"; : > "$CTR"; }

PASS=0; FAIL=0
ok(){ echo "  ok  - $1"; PASS=$((PASS+1)); }
ko(){ echo "  KO  - $1"; FAIL=$((FAIL+1)); }
assert_contains(){ printf '%s' "$1" | grep -qF "$2" && ok "$3" || { ko "$3 (attendu contient: $2)"; printf '     sortie: %s\n' "$1"; }; }
assert_rc(){ [ "$1" = "$2" ] && ok "$3 (rc=$1)" || ko "$3 (rc attendu $2, obtenu $1)"; }
delete_attempted(){ grep -q "^projects delete " "$REC"; }

echo "== teardown-lib fail-closed tests =="

# 1) NOMINAL — projet présent → delete → DELETE_REQUESTED → reçu OK
reset; OUT=$(SC=present_then_deleted MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[1] present_then_deleted"; assert_rc "$RC" 0 "reçu OK"; assert_contains "$OUT" "CLEANUP_RECEIPT=OK" "receipt OK"; assert_contains "$OUT" "PROJECT_STATE=DELETE_REQUESTED" "état final DELETE_REQUESTED"; delete_attempted && ok "delete tenté" || ko "delete tenté"

# 2) TRANSITOIRE PERSISTANT — describe illisible → UNKNOWN → delete TENTÉ QUAND MÊME → reçu FAILED (fail-closed) [ex.3 + ex.5]
reset; OUT=$(SC=transient_persistent MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[2] transient_persistent (erreur réseau simulée)"; assert_rc "$RC" 1 "fail-closed"; assert_contains "$OUT" "TENTÉE QUAND MÊME" "suppression tentée malgré état illisible"; delete_attempted && ok "delete tenté malgré UNKNOWN (ex.3)" || ko "delete tenté malgré UNKNOWN (ex.3)"; assert_contains "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED (fail-closed, ex.4)"

# 3) TRANSITOIRE PUIS RÉTABLI — retry fonctionne → delete → DELETE_REQUESTED → reçu OK [ex.2]
reset; OUT=$(SC=transient_then_recover MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=5 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[3] transient_then_recover"; assert_rc "$RC" 0 "reçu OK après retry"; assert_contains "$OUT" "CLEANUP_RECEIPT=OK" "receipt OK"; delete_attempted && ok "delete tenté" || ko "delete tenté"

# 4) NOT_FOUND AUTHENTIFIÉ — auth saine → NOTFOUND → PAS de delete → reçu OK [ex.1]
reset; OUT=$(SC=notfound_auth MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[4] notfound_auth"; assert_rc "$RC" 0 "reçu OK"; assert_contains "$OUT" "PROJECT_STATE=NOTFOUND_AUTHENTICATED" "NOT_FOUND authentifié"; delete_attempted && ko "delete NON tenté (rien à supprimer)" || ok "delete non tenté (NOT_FOUND authentifié)"

# 5) NOT_FOUND mais AUTH CASSÉE — ne PAS conclure « absent » → UNKNOWN → delete tenté → reçu FAILED [ex.1 fail-closed]
reset; OUT=$(SC=notfound_auth_broken MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[5] notfound_auth_broken (not-found + auth KO)"; assert_rc "$RC" 1 "fail-closed"; delete_attempted && ok "delete tenté (auth non prouvée → pas 'absent')" || ko "delete tenté"; assert_contains "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED"

# 6) PERMISSION_DENIED explicite — projet peut exister → UNKNOWN → delete tenté → reçu FAILED [ex.1]
reset; OUT=$(SC=perm_denied MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[6] perm_denied"; assert_rc "$RC" 1 "fail-closed"; delete_attempted && ok "delete tenté" || ko "delete tenté"; assert_contains "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED"

# 7) DELETE ÉCHOUE, PROJET RESTE ACTIF — reçu FAILED (ne PASSE pas sur ACTIVE) [ex.4]
reset; OUT=$(SC=delete_fails_active MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX=2 WIF_DESCRIBE_RETRY_SLEEP=0; wif_teardown_project proj noop'); RC=$?
echo "[7] delete_fails_active"; assert_rc "$RC" 1 "fail-closed"; assert_contains "$OUT" "PROJECT_STATE=ACTIVE" "état final ACTIVE"; assert_contains "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED sur projet encore ACTIF"

echo ""
echo "== RÉSULTAT : PASS=$PASS FAIL=$FAIL =="
[ "$FAIL" -eq 0 ] || exit 1
