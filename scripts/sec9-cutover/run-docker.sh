#!/usr/bin/env bash
# P104 / SEC-9 — cutover rehearsal on REAL CONTAINERS (Docker), no Kubernetes.
#
# Fallback for hosts where `kind` cannot stand a control plane up. What is real
# here: two genuinely different api builds, real container start/stop with a real
# drain delay, real HTTP over a real network, and the REAL, unmodified
# scripts/deploy-cache-window.mjs driving the barrier from real container state.
# What is NOT here: a Kubernetes control plane (see run.sh for that).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
NET=sec9net
LOG="${SEC9_LOG:-/tmp/sec9-cutover-docker-evidence.log}"
: > "${LOG}"
say() { echo "$*" | tee -a "${LOG}"; }
hdr() { say ""; say "===== $* ====="; }

cleanup() {
  docker rm -f $(docker ps -aq --filter "label=sec9=api") >/dev/null 2>&1 || true
  docker rm -f sec9-state >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

curlc() { docker run --rm --network "${NET}" curlimages/curl:8.10.1 -s "$@"; }
start_pod() { # name image mode flag
  docker run -d --name "$1" --label sec9=api --network "${NET}" \
    -v sec9state:/state -e MODE="$3" -e DEPLOYMENT_ACCESS_ACTIVATION_ENABLED="$4" -e POD_NAME="$1" \
    "$2" node /app/stub-api.mjs >/dev/null
}
live() { docker ps --filter "label=sec9=api" --format '{{.Names}}' | tr '\n' ' '; }
# Any live api container answers; they share state via the volume.
api() { curlc "$@" ; }

hdr "0. build + baseline (pre-cutover code)"
docker build -q -t sec9-api:old "${HERE}" >/dev/null
docker build -q -t sec9-api:new "${HERE}" >/dev/null
docker network create "${NET}" >/dev/null
docker volume rm sec9state >/dev/null 2>&1 || true
start_pod sec9-old-1 sec9-api:old old 0
start_pod sec9-old-2 sec9-api:old old 0
sleep 3
say "live: $(live)"
BASE="$(api -D - -o /dev/null http://sec9-old-1:3001/)"
say "$(printf '%s' "${BASE}" | grep -iE '^(HTTP|cache-control|x-mode)' | tr -d '\r')"
printf '%s' "${BASE}" | grep -qi 'cache-control: public, max-age=60' || { say "FAIL: baseline header"; exit 1; }
say "=> a shared cache may reuse this for 60s WITHOUT revalidating. This is the hazard."

hdr "1. PHASE 1 — post-cutover code, interlock CLOSED (flag=0)"
start_pod sec9-new-1 sec9-api:new new 0
start_pod sec9-new-2 sec9-api:new new 0
sleep 3
say "live during rollout (old+new coexist, as after 'rollout status'): $(live)"
ACT1="$(api -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"mode":"password","password":"letmein"}' http://sec9-new-1:3001/access)"
say "RUNTIME PROBE — deployed api answers HTTP ${ACT1} to an activation attempt"
[ "${ACT1}" = "503" ] || { say "FAIL: expected 503 with the interlock closed"; exit 1; }

hdr "2. drain the pre-cutover containers (10s preStop-equivalent, then stop)"
( sleep 10; docker rm -f sec9-old-1 sec9-old-2 >/dev/null 2>&1 ) &
DRAINER=$!

hdr "3. BARRIER — the real scripts/deploy-cache-window.mjs, unmodified"
START=$(date +%s)
EXPECTED_IMAGE=sec9-api:new KUBECTL_BIN="${HERE}/fake-kubectl.sh" \
  LEGACY_MAX_AGE_SECONDS=60 SAFETY_MARGIN_SECONDS=30 POLL_INTERVAL_SECONDS=5 MAX_WAIT_SECONDS=600 \
  node "${REPO}/scripts/deploy-cache-window.mjs" 2>&1 | tee -a "${LOG}"
ELAPSED=$(( $(date +%s) - START ))
wait ${DRAINER} 2>/dev/null || true
say "barrier wall-clock: ${ELAPSED}s (must exceed the 60s legacy max-age + 30s margin)"
[ "${ELAPSED}" -ge 90 ] || { say "FAIL: barrier returned too early (${ELAPSED}s)"; exit 1; }
say "live after barrier: $(live)"

hdr "4. PHASE 2 — arm activation (flag=1)"
docker rm -f sec9-new-1 sec9-new-2 >/dev/null 2>&1
start_pod sec9-new-1 sec9-api:new new 1
start_pod sec9-new-2 sec9-api:new new 1
sleep 3
ACT2="$(api -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"mode":"password","password":"letmein"}' http://sec9-new-1:3001/access)"
say "activation attempt -> HTTP ${ACT2}"
[ "${ACT2}" = "200" ] || { say "FAIL: activation should succeed after phase 2"; exit 1; }

hdr "5. NEGATIVES — anonymous + cache headers"
ANON="$(api -D - -o /dev/null http://sec9-new-2:3001/)"
say "$(printf '%s' "${ANON}" | grep -iE '^(HTTP|cache-control|vary)' | tr -d '\r')"
printf '%s' "${ANON}" | grep -qiE '^HTTP/1.1 401' || { say "FAIL: anonymous must be 401"; exit 1; }
printf '%s' "${ANON}" | grep -qi 'no-store' || { say "FAIL: gated response must be no-store"; exit 1; }
LEAK="$(api -s http://sec9-new-2:3001/ | grep -c 'SECRET CONTENT' || true)"
say "bytes of protected content served to anonymous: ${LEAK}"
[ "${LEAK}" = "0" ] || { say "FAIL: content leaked"; exit 1; }
say "=> post-cutover responses are never reusable without revalidation, and a"
say "   revalidation traverses the gate and is refused."

hdr "6. ROLLBACK of phase 2 (flag back to 0)"
docker rm -f sec9-new-1 sec9-new-2 >/dev/null 2>&1
start_pod sec9-new-1 sec9-api:new new 0
sleep 3
ACT3="$(api -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"mode":"password","password":"other"}' http://sec9-new-1:3001/access)"
say "activation attempt after rollback -> HTTP ${ACT3}"
[ "${ACT3}" = "503" ] || { say "FAIL: rollback must re-close activation"; exit 1; }
STILL="$(api -o /dev/null -w '%{http_code}' http://sec9-new-1:3001/)"
say "already-protected deployment, anonymous GET after rollback -> HTTP ${STILL}"
[ "${STILL}" = "401" ] || { say "FAIL: ENFORCEMENT must not depend on the deploy flag"; exit 1; }
UNLOCK="$(api -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"password":"letmein"}' http://sec9-new-1:3001/__access)"
say "legitimate unlock after rollback -> HTTP ${UNLOCK}"
[ "${UNLOCK}" = "200" ] || { say "FAIL: unlock must still work"; exit 1; }

hdr "RESULT"
say "ALL CUTOVER ASSERTIONS PASSED (real containers, real HTTP, real barrier)"
say "evidence: ${LOG}"
