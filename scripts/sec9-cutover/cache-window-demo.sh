#!/usr/bin/env bash
# P104 / SEC-8 — OBSERVE the cache window, don't just assert it.
#
# The other harnesses prove the deploy SEQUENCE. This one proves the HAZARD the
# sequence exists for, by putting a real shared cache (cache-proxy.mjs, honouring
# max-age exactly as RFC 9111 permits) between the visitor and the api, and then
# running the attack:
#
#   A. PRE-CUTOVER code   — public deployment cached with max-age=60, owner then
#                           switches it to password. An anonymous visitor STILL
#                           receives the protected content from the cache.
#                           => the vulnerability, observed, not argued.
#   B. POST-CUTOVER code  — same sequence. The response is `no-cache`, so the
#                           cache must revalidate, the revalidation traverses the
#                           gate, and the visitor gets 401.
#                           => the window is closed at the origin.
#
# Usage: scripts/sec9-cutover/cache-window-demo.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NET=sec9demo
LOG="${SEC9_LOG:-/tmp/sec9-cache-window-demo.log}"
: > "${LOG}"
say() { echo "$*" | tee -a "${LOG}"; }
hdr() { say ""; say "===== $* ====="; }

cleanup() {
  docker rm -f $(docker ps -aq --filter "label=sec9demo=1") >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  docker volume rm sec9demostate >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

run_api() { # mode flag
  docker rm -f api >/dev/null 2>&1 || true
  docker run -d --name api --label sec9demo=1 --network "${NET}" --network-alias api \
    -v sec9demostate:/state -e MODE="$1" -e DEPLOYMENT_ACCESS_ACTIVATION_ENABLED="$2" -e POD_NAME=api \
    sec9-api:new node /app/stub-api.mjs >/dev/null
}
run_proxy() {
  docker rm -f proxy >/dev/null 2>&1 || true
  docker run -d --name proxy --label sec9demo=1 --network "${NET}" --network-alias proxy \
    -e UPSTREAM=http://api:3001 sec9-api:new node /app/cache-proxy.mjs >/dev/null
}
# GET through the shared cache.
via_cache() {
  docker run --rm --label sec9demo=1 --network "${NET}" sec9-api:new \
    node /app/probe.mjs GET http://proxy:8080/ 2>/dev/null
}
activate() {
  docker run --rm --label sec9demo=1 --network "${NET}" sec9-api:new \
    node /app/probe.mjs POST http://api:3001/access '{"mode":"password","password":"letmein"}' 2>/dev/null | head -1
}
reset_state() { docker run --rm --label sec9demo=1 --network "${NET}" -v sec9demostate:/state sec9-api:new \
    node -e "require('node:fs').writeFileSync('/state/access.json', JSON.stringify({mode:'public'}))" >/dev/null 2>&1; }

docker build -q -t sec9-api:new "${HERE}" >/dev/null
docker network create "${NET}" >/dev/null

# ---------------------------------------------------------------- SCENARIO A
hdr "A. PRE-CUTOVER code (max-age=60) — the attack"
run_api old 0; run_proxy; sleep 3; reset_state

A1="$(via_cache)"
say "1. anonymous GET (public)    -> $(printf '%s' "${A1}" | head -1 | tr -d '\r') | $(printf '%s' "${A1}" | grep -i '^cache-control' | tr -d '\r') | $(printf '%s' "${A1}" | grep -i '^x-cache' | tr -d '\r')"
printf '%s' "${A1}" | grep -q 'SECRET CONTENT' || { say "FAIL: expected content on first fetch"; exit 1; }

say "2. owner activates password  -> $(activate | tr -d '\r')   (pre-cutover code has NO interlock)"

A3="$(via_cache)"
A3_STATUS="$(printf '%s' "${A3}" | head -1 | tr -d '\r')"
A3_CACHE="$(printf '%s' "${A3}" | grep -i '^x-cache' | tr -d '\r')"
say "3. anonymous GET again       -> ${A3_STATUS} | ${A3_CACHE}"

if printf '%s' "${A3}" | grep -q 'SECRET CONTENT'; then
  say ">> VULNERABILITY OBSERVED: the deployment is password-protected at the origin,"
  say "   yet the shared cache just served its content to an anonymous visitor."
else
  say "FAIL: expected the pre-cutover cache replay to leak content — the demo is not"
  say "      reproducing the hazard, so scenario B would prove nothing."
  exit 1
fi

# ---------------------------------------------------------------- SCENARIO B
hdr "B. POST-CUTOVER code (no-cache) — the same attack, closed"
run_api new 1; run_proxy; sleep 3; reset_state

B1="$(via_cache)"
say "1. anonymous GET (public)    -> $(printf '%s' "${B1}" | head -1 | tr -d '\r') | $(printf '%s' "${B1}" | grep -i '^cache-control' | tr -d '\r') | $(printf '%s' "${B1}" | grep -i '^x-cache' | tr -d '\r')"
printf '%s' "${B1}" | grep -qi 'no-cache' || { say "FAIL: post-cutover must emit no-cache"; exit 1; }

say "2. owner activates password  -> $(activate | tr -d '\r')"

B3="$(via_cache)"
B3_STATUS="$(printf '%s' "${B3}" | head -1 | tr -d '\r')"
B3_CACHE="$(printf '%s' "${B3}" | grep -i '^x-cache' | tr -d '\r')"
say "3. anonymous GET again       -> ${B3_STATUS} | ${B3_CACHE}"
printf '%s' "${B3}" | grep -qE '401' || { say "FAIL: expected 401 through the cache"; exit 1; }
printf '%s' "${B3}" | grep -q 'SECRET CONTENT' && { say "FAIL: content leaked through the cache"; exit 1; }
say ">> CLOSED: the entry is not reusable without revalidation; the revalidation"
say "   traverses the gate and the anonymous visitor gets 401, zero bytes."

hdr "RESULT"
say "Cache window observed on pre-cutover code, and closed on post-cutover code."
say "evidence: ${LOG}"
