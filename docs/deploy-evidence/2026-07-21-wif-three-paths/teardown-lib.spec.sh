#!/usr/bin/env bash
###############################################################################
# teardown-lib.spec.sh — tests de la logique de teardown WIF FAIL-CLOSED.
#
# Exigences expert RR-08 (5) + RR-09 : mocks de `gcloud` (jeton + delete) ET de
# `curl` (réponse CRM v1 avec STATUT HTTP). Le classement d'état s'appuie sur le
# code HTTP structuré, jamais sur le message texte ambigu.
#
# Scénarios ($SC) :
#   present_then_deleted     200 ACTIVE → (delete) → 200 DELETE_REQUESTED
#   transient_persistent     curl code 000 à CHAQUE appel (réseau down) → UNKNOWN
#   transient_then_recover   000,000 puis 200 ACTIVE puis 200 DELETE_REQUESTED
#   notfound_structured_404  404 + {"error":{"status":"NOT_FOUND"}} (vrai absent)
#   ambiguous_403            403 PERMISSION_DENIED « not found OR permission denied »
#   exists_no_getdelete      RR-09 : jeton VALIDE + projet EXISTANT, principal SANS
#                            projects.get (GET→403) NI projects.delete (delete→403)
#   ambiguous_404_no_status  404 sans statut structuré (corps HTML) → PAS NOTFOUND
#   delete_fails_active      200 ACTIVE en permanence, delete échoue → reste ACTIF
#   auth_broken              gcloud auth print-access-token échoue (pas de jeton)
###############################################################################
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/teardown-lib.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"; mkdir -p "$BIN"
REC="$TMP/calls.log"; CTR="$TMP/curl.ctr"

# ---- FAUX curl : émet <body>\n<http_code> selon $SC + compteur d'appels --------
cat > "$BIN/curl" <<'MOCK'
#!/usr/bin/env bash
REC="${MOCK_REC:?}"; CTR="${MOCK_CTR:?}"; SC="${SC:?}"
echo "curl $*" >> "$REC"
n=$(( $(cat "$CTR" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$CTR"
emit(){ printf '%s\n%s' "$1" "$2"; }   # $1=body  $2=http_code
case "$SC" in
  present_then_deleted)
    if [ "$n" -le 1 ]; then emit '{"projectId":"proj","lifecycleState":"ACTIVE"}' 200
    else emit '{"projectId":"proj","lifecycleState":"DELETE_REQUESTED"}' 200; fi ;;
  transient_persistent) emit '' 000 ;;
  transient_then_recover)
    if [ "$n" -le 2 ]; then emit '' 000
    elif [ "$n" -eq 3 ]; then emit '{"lifecycleState":"ACTIVE"}' 200
    else emit '{"lifecycleState":"DELETE_REQUESTED"}' 200; fi ;;
  notfound_structured_404) emit '{"error":{"code":404,"status":"NOT_FOUND","message":"Project not found."}}' 404 ;;
  ambiguous_403)           emit '{"error":{"code":403,"status":"PERMISSION_DENIED","message":"The caller does not have permission (project not found or permission denied)."}}' 403 ;;
  exists_no_getdelete)     emit '{"error":{"code":403,"status":"PERMISSION_DENIED","message":"The caller does not have permission"}}' 403 ;;
  ambiguous_404_no_status) emit '<html><title>404</title>Not Found</html>' 404 ;;
  delete_fails_active)     emit '{"lifecycleState":"ACTIVE"}' 200 ;;
  auth_broken)             emit '{"lifecycleState":"ACTIVE"}' 200 ;;
esac
MOCK
chmod +x "$BIN/curl"

# ---- FAUX gcloud : jeton d'accès + projects delete -----------------------------
cat > "$BIN/gcloud" <<'MOCK'
#!/usr/bin/env bash
REC="${MOCK_REC:?}"; SC="${SC:?}"
echo "gcloud $*" >> "$REC"
case "${1:-} ${2:-}" in
  "auth print-access-token")
    case "$SC" in auth_broken) echo "ERROR: reauth required" >&2; exit 1 ;; *) echo "ya29.mock-token"; exit 0 ;; esac ;;
  "projects delete")
    case "$SC" in
      delete_fails_active|exists_no_getdelete) echo "ERROR: PERMISSION_DENIED: caller cannot delete" >&2; exit 1 ;;
      *) echo "Deleted [projects/proj]."; exit 0 ;;
    esac ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$BIN/gcloud"

# ---- harnais ------------------------------------------------------------------
PASS=0; FAIL=0
ok(){ echo "  ok  - $1"; PASS=$((PASS+1)); }
ko(){ echo "  KO  - $1"; FAIL=$((FAIL+1)); }
ac(){ printf '%s' "$1" | grep -qF "$2" && ok "$3" || { ko "$3 (attendu contient: $2)"; printf '     sortie: %s\n' "$1"; }; }
arc(){ [ "$1" = "$2" ] && ok "$3 (rc=$1)" || ko "$3 (rc attendu $2, obtenu $1)"; }
delete_attempted(){ grep -q "^gcloud projects delete " "$REC"; }
# exécute wif_teardown_project sous un scénario, PATH mocké, retries courts
run(){ local sc="$1" mx="${2:-2}"; : > "$REC"; : > "$CTR"
  SC="$sc" MOCK_REC="$REC" MOCK_CTR="$CTR" PATH="$BIN:$PATH" \
    bash -c 'source '"$HERE"'/teardown-lib.sh; export WIF_DESCRIBE_RETRY_MAX='"$mx"' WIF_DESCRIBE_RETRY_SLEEP=0 WIF_CRM_BASE="https://crm.mock/v1/projects"; wif_teardown_project proj noop'; }

echo "== teardown-lib fail-closed tests (RR-08 + RR-09) =="

echo "[1] present_then_deleted"; OUT=$(run present_then_deleted); RC=$?
arc "$RC" 0 "reçu OK"; ac "$OUT" "CLEANUP_RECEIPT=OK" "receipt OK"; ac "$OUT" "PROJECT_STATE=DELETE_REQUESTED" "DELETE_REQUESTED"; delete_attempted && ok "delete tenté" || ko "delete tenté"

echo "[2] transient_persistent (curl 000 permanent)"; OUT=$(run transient_persistent 2); RC=$?
arc "$RC" 1 "fail-closed"; ac "$OUT" "TENTÉE QUAND MÊME" "delete malgré état illisible"; delete_attempted && ok "delete tenté (ex.3)" || ko "delete tenté (ex.3)"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED (ex.4)"

echo "[3] transient_then_recover (retry → 200)"; OUT=$(run transient_then_recover 5); RC=$?
arc "$RC" 0 "reçu OK après retry"; ac "$OUT" "CLEANUP_RECEIPT=OK" "receipt OK"; delete_attempted && ok "delete tenté" || ko "delete tenté"

echo "[4] notfound_structured_404 (vrai 404 NOT_FOUND)"; OUT=$(run notfound_structured_404); RC=$?
arc "$RC" 0 "reçu OK"; ac "$OUT" "PROJECT_STATE=NOTFOUND_STRUCTURED_404" "404 structuré"; delete_attempted && ko "delete NON attendu" || ok "delete non tenté (404 structuré)"

echo "[5] ambiguous_403 (RR-09 : jamais 'absent')"; OUT=$(run ambiguous_403); RC=$?
arc "$RC" 1 "fail-closed"; printf '%s' "$OUT" | grep -qF "NOTFOUND" && ko "403 ambigu NE doit PAS être NOTFOUND" || ok "403 ambigu → PAS NOTFOUND (RR-09)"; delete_attempted && ok "delete tenté" || ko "delete tenté"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED"

echo "[6] exists_no_getdelete (RR-09 EXIGÉ : token valide + projet existant, sans get/delete)"; OUT=$(run exists_no_getdelete); RC=$?
arc "$RC" 1 "fail-closed"; delete_attempted && ok "delete tenté (403)" || ko "delete tenté"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED (PAS OK)"; printf '%s' "$OUT" | grep -qF "CLEANUP_RECEIPT=OK" && ko "ne doit PAS émettre OK" || ok "aucun CLEANUP_RECEIPT=OK"

echo "[7] ambiguous_404_no_status (404 sans statut structuré)"; OUT=$(run ambiguous_404_no_status); RC=$?
arc "$RC" 1 "fail-closed"; printf '%s' "$OUT" | grep -qF "NOTFOUND" && ko "404 non structuré NE doit PAS être NOTFOUND" || ok "404 ambigu → PAS NOTFOUND"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED"

echo "[8] delete_fails_active (delete échoue, reste ACTIF)"; OUT=$(run delete_fails_active); RC=$?
arc "$RC" 1 "fail-closed"; ac "$OUT" "PROJECT_STATE=ACTIVE" "état ACTIVE"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED sur ACTIF"

echo "[9] auth_broken (pas de jeton)"; OUT=$(run auth_broken 2); RC=$?
arc "$RC" 1 "fail-closed"; delete_attempted && ok "delete tenté (auth KO → pas 'absent')" || ko "delete tenté"; ac "$OUT" "CLEANUP_RECEIPT=FAILED" "reçu FAILED"

echo ""
echo "== RÉSULTAT : PASS=$PASS FAIL=$FAIL =="
[ "$FAIL" -eq 0 ] || exit 1
