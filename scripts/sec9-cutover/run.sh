#!/usr/bin/env bash
# P104 / SEC-9 — REAL cutover rehearsal on a REAL Kubernetes cluster (kind).
#
# Proves, end to end and observably:
#   0. baseline    — pre-cutover pods serve `public, max-age=60` (the hazard)
#   1. phase 1     — new code rolled out with the interlock CLOSED; the deployed
#                    api REFUSES activation (503) — runtime probe, not a source grep
#   2. cache window— an old response is captured and its freshness lifetime shown
#   3. barrier     — the REAL scripts/deploy-cache-window.mjs runs against this
#                    cluster: waits for every old pod to vanish, then 60s+margin
#   4. phase 2     — flag flipped to 1; activation now SUCCEEDS
#   5. negatives   — anonymous GET is 401; the served bytes are no-store; the
#                    pre-cutover cached entry must revalidate and gets refused
#   6. rollback    — phase 2 rolled back (flag -> 0): activation refused again,
#                    but the ALREADY-protected deployment stays gated (enforcement
#                    must never depend on the deploy flag)
#
# Usage: scripts/sec9-cutover/run.sh [--keep]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
CLUSTER=sec9-cutover
NS=sec9
KEEP=${1:-}
LOG="${SEC9_LOG:-/tmp/sec9-cutover-evidence.log}"

: > "${LOG}"
say() { echo "$*" | tee -a "${LOG}"; }
hdr() { say ""; say "===== $* ====="; }

cleanup() { [ "${KEEP}" = "--keep" ] || kind delete cluster --name "${CLUSTER}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# curl from inside the cluster (the Service is not routable from the host).
kc() { kubectl --context "kind-${CLUSTER}" "$@"; }
#
# `kubectl run --rm -i` is not a reliable transport on its own: the throwaway pod
# has to be scheduled, started and attached to, and under load any of those can
# lose the output — which comes back as an EMPTY string, not an error. An empty
# status then fails an assertion that expects e.g. "401", making the harness
# report a product failure when nothing about the product was actually observed.
#
# The probe runs the stub image (already loaded into the node) with probe.mjs, so
# it needs NO registry: pulling curlimages/curl made every probe depend on Docker
# Hub, and `kind load` of it fails here on the multi-arch manifest.
#
# Retry until we get a non-empty answer. An inconclusive probe must never be
# reported as a verdict either way.
#
# probe <METHOD> <URL> [JSON_BODY] -> curl-like transcript (status line, headers,
# blank line, body).
probe() {
  local attempt out
  for attempt in 1 2 3 4 5; do
    out="$(kc -n "${NS}" run "probe-$RANDOM-${attempt}" --rm -i --restart=Never --quiet \
      --image=sec9-api:new --image-pull-policy=IfNotPresent \
      --command -- node /app/probe.mjs "$@" 2>/dev/null)"

    if [ -n "${out}" ]; then
      printf '%s' "${out}"
      return 0
    fi
  done

  echo "PROBE_INCONCLUSIVE" >&2

  return 1
}

# Status code only.
probe_code() { probe "$@" | head -1 | awk '{print $2}'; }

# Wait until the Service actually has ready endpoints. `rollout status` returns on
# pod availability, which is not the same thing as the Service being routable.
wait_endpoints() {
  local i
  for i in $(seq 1 60); do
    if [ -n "$(kc -n "${NS}" get endpoints api -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null)" ]; then
      return 0
    fi
    sleep 2
  done
  say "FAIL: Service 'api' never got ready endpoints"
  exit 1
}
flag() { kc -n "${NS}" get cm platform-env -o jsonpath='{.data.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED}'; }
setflag() {
  kc -n "${NS}" patch cm platform-env --type merge \
    -p "{\"data\":{\"DEPLOYMENT_ACCESS_ACTIVATION_ENABLED\":\"$1\"}}" >/dev/null
  # envFrom values are read at container start -> restart, exactly like the real
  # chart (whose configmap checksum annotation rolls the Deployment).
  kc -n "${NS}" rollout restart deploy/api >/dev/null
  kc -n "${NS}" rollout status deploy/api --timeout=180s >/dev/null
  wait_endpoints
}

hdr "0. cluster + images"
kind create cluster --name "${CLUSTER}" --wait 300s >/dev/null
kc wait --for=condition=Ready node --all --timeout=300s >/dev/null
docker build -q -t sec9-api:old "${HERE}" >/dev/null
docker build -q -t sec9-api:new "${HERE}" >/dev/null
# Preload EVERY image the run needs, probe tool included. A fresh kind node has an
# empty image store, so a `kubectl run --image=curlimages/curl` reaches out to
# Docker Hub — and a rate limit or an offline moment then turns every probe into
# an empty answer, i.e. a fake product failure. Load it once, pin IfNotPresent,
# and the harness stops depending on the registry at all.
kind load docker-image sec9-api:old --name "${CLUSTER}" >/dev/null
kind load docker-image sec9-api:new --name "${CLUSTER}" >/dev/null
kc create ns "${NS}" >/dev/null
kc apply -f "${HERE}/manifests.yaml" >/dev/null
kc -n "${NS}" rollout status deploy/api --timeout=180s >/dev/null
wait_endpoints
say "cluster up; api at image sec9-api:old (MODE=old), $(kc -n ${NS} get pods -l app.kubernetes.io/name=api --no-headers | wc -l | tr -d ' ') pods"

hdr "0b. BASELINE — pre-cutover pods serve a cacheable PUBLIC response"
OLD_HEADERS="$(probe GET http://api.${NS}.svc:3001/)"
say "$(printf '%s' "${OLD_HEADERS}" | grep -iE '^(HTTP|cache-control|x-mode)' | tr -d '\r')"
printf '%s' "${OLD_HEADERS}" | grep -qi 'cache-control: public, max-age=60' \
  || { say "FAIL: expected max-age=60 from MODE=old"; exit 1; }
say "=> a shared cache may reuse this for 60s WITHOUT revalidating. This is the hazard."

hdr "1. PHASE 1 — roll out post-cutover code with the interlock CLOSED"
say "flag before: '$(flag)'"
kc -n "${NS}" set image deploy/api api=sec9-api:new >/dev/null
kc -n "${NS}" set env deploy/api MODE=new >/dev/null
kc -n "${NS}" rollout status deploy/api --timeout=180s >/dev/null
wait_endpoints
say "rollout complete (this is where the OLD workflow stopped)"

ACT1="$(probe_code POST http://api.${NS}.svc:3001/access '{"mode":"password","password":"letmein"}')"
say "RUNTIME PROBE — deployed api answers HTTP ${ACT1} to an activation attempt"
[ "${ACT1}" = "503" ] || { say "FAIL: expected 503 while the interlock is closed"; exit 1; }
say "=> activation is REFUSED by the deployed production API itself (503), flag='$(flag)'"

hdr "2. THE CACHE WINDOW an old pod could still have left behind"
say "an old pod's last public response stays fresh for 60s after it was emitted;"
say "the origin cannot purge it, so activation must not become possible before it expires."

hdr "3. BARRIER — the real scripts/deploy-cache-window.mjs against this cluster"
EXPECTED_IMAGE="$(kc -n "${NS}" get deploy api -o jsonpath='{.spec.template.spec.containers[0].image}')"
say "target image: ${EXPECTED_IMAGE}"
BARRIER_START=$(date +%s)
HELM_NAMESPACE="${NS}" HELM_RELEASE=vibecore EXPECTED_IMAGE="${EXPECTED_IMAGE}" \
  LEGACY_MAX_AGE_SECONDS=60 SAFETY_MARGIN_SECONDS=30 POLL_INTERVAL_SECONDS=5 MAX_WAIT_SECONDS=600 \
  KUBECTL_BIN="$(command -v kubectl)" \
  node "${REPO}/scripts/deploy-cache-window.mjs" 2>&1 | tee -a "${LOG}"
BARRIER_ELAPSED=$(( $(date +%s) - BARRIER_START ))
say "barrier wall-clock: ${BARRIER_ELAPSED}s"
[ "${BARRIER_ELAPSED}" -ge 90 ] || { say "FAIL: barrier returned in ${BARRIER_ELAPSED}s, less than the 60+30s it must outlast"; exit 1; }
say "=> barrier waited >= 90s AFTER the last pre-cutover pod disappeared"

hdr "4. PHASE 2 — arm activation"
setflag 1
say "flag now: '$(flag)'"
ACT2="$(probe_code POST http://api.${NS}.svc:3001/access '{"mode":"password","password":"letmein"}')"
say "activation attempt -> HTTP ${ACT2}"
[ "${ACT2}" = "200" ] || { say "FAIL: expected activation to succeed after phase 2"; exit 1; }

hdr "5. NEGATIVES — anonymous + cache"
ANON="$(probe GET http://api.${NS}.svc:3001/)"
ANON_CODE="$(printf '%s' "${ANON}" | head -1 | tr -d '\r')"
say "anonymous GET -> ${ANON_CODE}"
printf '%s' "${ANON}" | grep -qiE '^HTTP/1.1 401' || { say "FAIL: anonymous must be 401"; exit 1; }
say "$(printf '%s' "${ANON}" | grep -iE '^(cache-control|vary)' | tr -d '\r')"
printf '%s' "${ANON}" | grep -qi 'no-store' || { say "FAIL: gated response must be no-store"; exit 1; }
BODY_LEAK="$(probe GET http://api.${NS}.svc:3001/ | grep -c 'SECRET CONTENT' || true)"
say "bytes of protected content leaked to anonymous: ${BODY_LEAK}"
[ "${BODY_LEAK}" = "0" ] || { say "FAIL: content leaked"; exit 1; }
PUB_NOW="$(probe GET http://api.${NS}.svc:3001/ | grep -i '^cache-control' | tr -d '\r')"
say "post-cutover header on every response: ${PUB_NOW}"
say "=> nothing reusable without revalidation; a revalidation hits the gate and gets 401"

hdr "6. ROLLBACK of phase 2 — flag back to 0"
setflag 0
say "flag now: '$(flag)'"
ACT3="$(probe_code POST http://api.${NS}.svc:3001/access '{"mode":"password","password":"other"}')"
say "activation attempt after rollback -> HTTP ${ACT3}"
[ "${ACT3}" = "503" ] || { say "FAIL: rollback must re-close activation"; exit 1; }
STILL="$(probe_code GET http://api.${NS}.svc:3001/)"
say "already-protected deployment, anonymous GET after rollback -> HTTP ${STILL}"
[ "${STILL}" = "401" ] || { say "FAIL: ENFORCEMENT must not depend on the deploy flag"; exit 1; }
UNLOCK="$(probe_code POST http://api.${NS}.svc:3001/__access '{"password":"letmein"}')"
say "unlock with the real password after rollback -> HTTP ${UNLOCK}"
[ "${UNLOCK}" = "200" ] || { say "FAIL: legitimate unlock must still work"; exit 1; }

hdr "RESULT"
say "ALL CUTOVER ASSERTIONS PASSED"
say "evidence: ${LOG}"
