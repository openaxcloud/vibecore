#!/usr/bin/env bash
###############################################################################
# teardown-lib.sh — logique de teardown WIF, FAIL-CLOSED, testable via mock gcloud.
#
# Corrections expert RR-20260723-CODEX-08 (RR-08) §P0-A2-09 :
#  (1) un échec de `gcloud projects describe` n'est PLUS assimilé à « projet absent » :
#      on PARSE le motif d'erreur pour distinguer un VRAI NOT_FOUND *authentifié*
#      (projet réellement introuvable, auth saine) des autres erreurs — transitoires
#      (réseau/API/quota) ou de permission ;
#  (2) `describe` est RÉESSAYÉ sur erreurs transitoires (retry borné) ;
#  (3) `gcloud projects delete` est TENTÉ MÊME quand l'état ne peut pas être lu de
#      façon fiable (classification UNKNOWN) ;
#  (4) le REÇU de nettoyage ÉCHOUE (fail-closed) si l'état final n'est ni
#      DELETE_REQUESTED ni un NOT_FOUND authentifié.
#
# Aucune dépendance à repro.sh : sourcable et pilotable via un faux `gcloud` sur le
# PATH (cf teardown-lib.spec.sh). Toutes les fonctions sont sûres sous `set -e`.
###############################################################################

# --- classification d'un message d'erreur gcloud (parse, ex.1) ---------------
# TRANSITOIRE : réseau / API 5xx / quota / flap d'auth réseau → doit être réessayé.
_wif_err_is_transient(){
  printf '%s' "$1" | grep -qiE \
    "unable to connect|network is unreachable|check your network|timed out|timeout|deadline exceeded|temporarily unavailable|service unavailable|serviceexception: *5|httperror 5|http error 5|\\b50[0-9]\\b|resource_exhausted|quota exceeded|rate limit|backend error|connection reset|connection refused|could not reach|name or service not known|eof occurred|refreshing.*auth tokens|try again later|try again\\.?$"
}
# PERMISSION explicite (motif gRPC/HTTP) → on ne peut PAS conclure « absent ».
# NB : on n'inclut PAS la phrase « permission denied » nue car le message générique
# gcloud d'un projet introuvable est « ... not found or permission denied. ».
_wif_err_is_permission(){
  printf '%s' "$1" | grep -qiE \
    "permission_denied|does not have permission|caller does not have|not authorized|httperror 403|http error 403|\\b403\\b|forbidden"
}
# NOT_FOUND (motif) — à confirmer par une auth saine avant de conclure.
_wif_err_is_notfound(){
  printf '%s' "$1" | grep -qiE \
    "not_found|not found|does not exist|failed to find project|httperror 404|http error 404|\\b404\\b"
}
# Auth prouvée saine = on sait minter un jeton (réseau + creds OK).
_wif_auth_healthy(){
  gcloud auth print-access-token >/dev/null 2>&1
}

# classify_project_state PROJECT
#   stdout : "PRESENT:<lifecycleState>" | "NOTFOUND" | "UNKNOWN"
#   return : 0 PRESENT · 1 NOT_FOUND authentifié · 2 UNKNOWN (indéterminé, fail-closed)
classify_project_state(){
  local project="$1" out rc n=0 max="${WIF_DESCRIBE_RETRY_MAX:-5}" slp="${WIF_DESCRIBE_RETRY_SLEEP:-3}"
  while : ; do
    if out=$(gcloud projects describe "$project" --format="value(lifecycleState)" 2>&1); then
      printf 'PRESENT:%s\n' "$out"; return 0
    fi
    # (2) transitoire → retry borné, puis UNKNOWN si persistant
    if _wif_err_is_transient "$out"; then
      if [ "$n" -lt "$max" ]; then n=$((n+1)); sleep "$slp"; continue; fi
      printf 'UNKNOWN\n'; return 2
    fi
    # (1) permission explicite → UNKNOWN (indéterminé, jamais « absent »)
    if _wif_err_is_permission "$out"; then
      printf 'UNKNOWN\n'; return 2
    fi
    # (1) NOT_FOUND *authentifié* : motif not-found ET auth prouvée saine
    if _wif_err_is_notfound "$out" && _wif_auth_healthy; then
      printf 'NOTFOUND\n'; return 1
    fi
    # non classable (auth non prouvée, motif inconnu) → UNKNOWN (fail-closed)
    printf 'UNKNOWN\n'; return 2
  done
}

# attempt_project_delete PROJECT — tente la suppression, best-effort, trace sur stdout.
attempt_project_delete(){
  local project="$1" out
  if out=$(gcloud projects delete "$project" --quiet 2>&1); then
    echo "PROJECT_DELETE_ATTEMPT=ok"
  else
    echo "PROJECT_DELETE_ATTEMPT=nonzero"
  fi
}

# finalize_cleanup_receipt PROJECT
#   Re-classe l'état FINAL et n'émet CLEANUP_RECEIPT=OK QUE si DELETE_REQUESTED ou
#   NOT_FOUND authentifié. Sinon CLEANUP_RECEIPT=FAILED + return 1 (fail-closed, ex.4).
finalize_cleanup_receipt(){
  local project="$1" state crc
  if state=$(classify_project_state "$project"); then crc=0; else crc=$?; fi
  case "$crc:$state" in
    1:NOTFOUND)
      echo "PROJECT_STATE=NOTFOUND_AUTHENTICATED"
      echo "CLEANUP_RECEIPT=OK"; return 0 ;;
    0:PRESENT:DELETE_REQUESTED)
      echo "PROJECT_STATE=DELETE_REQUESTED"
      echo "CLEANUP_RECEIPT=OK"; return 0 ;;
    0:PRESENT:*)
      echo "PROJECT_STATE=${state#PRESENT:}"
      echo "CLEANUP_RECEIPT=FAILED (projet toujours présent, état != DELETE_REQUESTED)"; return 1 ;;
    *)
      echo "PROJECT_STATE=UNKNOWN (describe non fiable après retries)"
      echo "CLEANUP_RECEIPT=FAILED (état final indéterminable — fail-closed)"; return 1 ;;
  esac
}

# wif_teardown_project PROJECT [SUBRES_FN]
#   Orchestration fail-closed complète :
#     classify → (si != NOT_FOUND) supprime sous-ressources + TENTE projects delete
#               (même si état UNKNOWN, ex.3) → reçu final fail-closed (ex.4).
#   SUBRES_FN : nom d'une fonction supprimant les sous-ressources (best-effort).
#   return : 0 si reçu OK (DELETE_REQUESTED ou NOT_FOUND authentifié), 1 sinon.
wif_teardown_project(){
  local project="$1" subres_fn="${2:-}" state crc
  if state=$(classify_project_state "$project"); then crc=0; else crc=$?; fi
  echo "DESCRIBE_CLASSIFICATION=$state (rc=$crc)"
  if [ "$crc" -eq 1 ]; then
    echo "NOT_FOUND authentifié : aucune ressource à supprimer"
  else
    if [ "$crc" -eq 2 ]; then
      echo "WARN: état projet INDÉTERMINÉ (describe non fiable après retries) — suppression TENTÉE QUAND MÊME (fail-closed, RR-08 ex.3)"
    fi
    if [ -n "$subres_fn" ] && declare -F "$subres_fn" >/dev/null 2>&1; then "$subres_fn" || true; fi
    attempt_project_delete "$project" || true
  fi
  finalize_cleanup_receipt "$project"
}
