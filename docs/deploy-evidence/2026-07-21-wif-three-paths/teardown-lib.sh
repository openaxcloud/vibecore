#!/usr/bin/env bash
###############################################################################
# teardown-lib.sh — logique de teardown WIF, FAIL-CLOSED, testable via mocks.
#
# Corrections expert RR-20260723-CODEX-08 (RR-08) puis -09 (RR-09) §P0-A2-09 :
#  (1) un échec de lecture d'état n'est PLUS assimilé à « projet absent » ;
#  (2) l'état est lu via l'API Cloud Resource Manager v1 (STATUT HTTP STRUCTURÉ),
#      pas via le message texte AMBIGU de `gcloud projects describe` :
#      - HTTP 200                       → PRESENT:<lifecycleState>
#      - HTTP 404 + status=NOT_FOUND    → NOTFOUND (vrai absent, non ambigu)
#      - HTTP 401/403/ambigu            → UNKNOWN  (RR-09 : « not found OR permission
#        denied » N'EST JAMAIS conclu absent — un jeton valide prouve l'AUTH, pas
#        l'AUTORISATION projects.get ; GCP renvoie 403 aussi pour un projet inexistant)
#      - HTTP 000/429/5xx               → transitoire → retry borné → UNKNOWN
#  (3) `gcloud projects delete` est TENTÉ MÊME quand l'état est UNKNOWN (illisible) ;
#  (4) le REÇU de nettoyage ÉCHOUE si l'état final n'est ni DELETE_REQUESTED ni un
#      NOT_FOUND STRUCTURÉ (404). Tout état UNKNOWN/ACTIF ⇒ CLEANUP_RECEIPT=FAILED.
#
# Sourcable et pilotable via de faux `gcloud`/`curl` sur le PATH (teardown-lib.spec.sh).
# Toutes les fonctions sont sûres sous `set -e`.
###############################################################################

WIF_CRM_BASE="${WIF_CRM_BASE:-https://cloudresourcemanager.googleapis.com/v1/projects}"

_wif_py(){ "${CLOUDSDK_PYTHON:-python3}" "$@"; }
# lit un champ top-level d'un JSON sur stdin (vide si absent / non-JSON)
_wif_json_field(){ _wif_py -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print(""); sys.exit(0)
v=d.get(sys.argv[1],"")
print(v if isinstance(v,str) else "")' "$1"; }
# lit .error.status d'un JSON sur stdin (vide si absent / non-JSON)
_wif_json_error_status(){ _wif_py -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print(""); sys.exit(0)
e=d.get("error") or {}
print(e.get("status","") if isinstance(e,dict) else "")'; }

# classify_project_state PROJECT
#   Interroge CRM v1 `projects.get` et classe sur le STATUT HTTP STRUCTURÉ.
#   stdout : "PRESENT:<lifecycleState>" | "NOTFOUND" | "UNKNOWN"
#   return : 0 PRESENT · 1 NOTFOUND (404 structuré) · 2 UNKNOWN (indéterminé, fail-closed)
classify_project_state(){
  local project="$1" n=0 max slp token resp code body status state
  max="${WIF_DESCRIBE_RETRY_MAX:-5}"; slp="${WIF_DESCRIBE_RETRY_SLEEP:-3}"
  while : ; do
    # jeton d'accès (auth). Son absence = auth/transitoire → retry puis UNKNOWN.
    if ! token=$(gcloud auth print-access-token 2>/dev/null) || [ -z "$token" ]; then
      if [ "$n" -lt "$max" ]; then n=$((n+1)); sleep "$slp"; continue; fi
      printf 'UNKNOWN\n'; return 2
    fi
    resp=$(curl -s -m 20 -w $'\n%{http_code}' -H "Authorization: Bearer $token" \
           "${WIF_CRM_BASE}/${project}" 2>/dev/null)
    code=$(printf '%s' "$resp" | tail -n1)
    body=$(printf '%s' "$resp" | sed '$d')
    case "$code" in
      200)
        state=$(printf '%s' "$body" | _wif_json_field lifecycleState)
        printf 'PRESENT:%s\n' "$state"; return 0 ;;
      404)
        status=$(printf '%s' "$body" | _wif_json_error_status)
        if [ "$status" = "NOT_FOUND" ]; then printf 'NOTFOUND\n'; return 1; fi
        # 404 sans statut structuré non ambigu → on NE conclut PAS absent.
        printf 'UNKNOWN\n'; return 2 ;;
      401|403)
        # AMBIGU (RR-09) : projet inexistant OU permission manquante → jamais « absent ».
        printf 'UNKNOWN\n'; return 2 ;;
      000|408|429|5[0-9][0-9])
        if [ "$n" -lt "$max" ]; then n=$((n+1)); sleep "$slp"; continue; fi
        printf 'UNKNOWN\n'; return 2 ;;
      *)
        printf 'UNKNOWN\n'; return 2 ;;
    esac
  done
}

# attempt_project_delete PROJECT — tente la suppression (best-effort), trace sur stdout.
attempt_project_delete(){
  local project="$1" out
  if out=$(gcloud projects delete "$project" --quiet 2>&1); then
    echo "PROJECT_DELETE_ATTEMPT=ok"
  else
    echo "PROJECT_DELETE_ATTEMPT=nonzero"
  fi
}

# finalize_cleanup_receipt PROJECT
#   Ré-classe l'état FINAL ; CLEANUP_RECEIPT=OK UNIQUEMENT si DELETE_REQUESTED ou
#   NOT_FOUND structuré (404). Sinon CLEANUP_RECEIPT=FAILED + return 1 (fail-closed).
finalize_cleanup_receipt(){
  local project="$1" state crc
  if state=$(classify_project_state "$project"); then crc=0; else crc=$?; fi
  case "$crc:$state" in
    1:NOTFOUND)
      echo "PROJECT_STATE=NOTFOUND_STRUCTURED_404"
      echo "CLEANUP_RECEIPT=OK"; return 0 ;;
    0:PRESENT:DELETE_REQUESTED)
      echo "PROJECT_STATE=DELETE_REQUESTED"
      echo "CLEANUP_RECEIPT=OK"; return 0 ;;
    0:PRESENT:*)
      echo "PROJECT_STATE=${state#PRESENT:}"
      echo "CLEANUP_RECEIPT=FAILED (projet toujours présent, état != DELETE_REQUESTED)"; return 1 ;;
    *)
      echo "PROJECT_STATE=UNKNOWN (état non déterminable de façon non ambiguë)"
      echo "CLEANUP_RECEIPT=FAILED (état final indéterminable — fail-closed)"; return 1 ;;
  esac
}

# wif_teardown_project PROJECT [SUBRES_FN]
#   classify → (si != NOTFOUND) supprime sous-ressources + TENTE projects delete
#             (même si UNKNOWN, ex.3) → reçu final fail-closed (ex.4).
#   return : 0 si reçu OK (DELETE_REQUESTED ou 404 structuré), 1 sinon.
wif_teardown_project(){
  local project="$1" subres_fn="${2:-}" state crc
  if state=$(classify_project_state "$project"); then crc=0; else crc=$?; fi
  echo "DESCRIBE_CLASSIFICATION=$state (rc=$crc)"
  if [ "$crc" -eq 1 ]; then
    echo "NOT_FOUND structuré (404) : aucune ressource à supprimer"
  else
    if [ "$crc" -eq 2 ]; then
      echo "WARN: état projet INDÉTERMINÉ (réponse ambiguë/transitoire) — suppression TENTÉE QUAND MÊME (fail-closed, RR-08/09 ex.3)"
    fi
    if [ -n "$subres_fn" ] && declare -F "$subres_fn" >/dev/null 2>&1; then "$subres_fn" || true; fi
    attempt_project_delete "$project" || true
  fi
  finalize_cleanup_receipt "$project"
}
