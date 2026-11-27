#!/usr/bin/env bash
set -eu
repo=$(cd "$(dirname "$0")/../.." && pwd)
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
mkdir -p "$d/tests" "$d/bin"
ln -s "$repo/tests/private-runtime-dynamic" "$d/tests/private-runtime-dynamic"
cd "$d"
export GITHUB_SHA=979684871390787986cea1d830331af1a146c65d
export PATH="$d/bin:$PATH"
cat >bin/pnpm <<'SH'
#!/bin/bash
case "$*" in
  *start:node*|*admin\ dev*) exec sleep 30;;
  *preview-runtime.spec.ts*) lane=orbit;;
  *private-runtime-readme*) lane=readme;;
  *private-runtime-dynamic*) lane=publication;;
  *'grep-invert'*) lane=remaining;;
  *) lane=audit;;
esac
echo "$lane" >>calls
if [[ "$lane" == remaining && "$SECOND_FAILURE" == yes ]]; then exit 46; fi
if [[ "$lane" == "$FAIL_LANE" ]]; then [[ "$RC" != timer ]] || exec sleep 5; exit "$RC"; fi
if [[ "$lane" == publication && "$RECEIPT" != none ]]; then
  echo "{\"commit\":\"${RECEIPT:-$GITHUB_SHA}\",\"savedVersion\":true,\"podEndpointReady\":true,\"anonymousResponses\":2,\"httpStatus\":200,\"exactCalculation\":true,\"network\":\"local\"}" >private-runtime-evidence/dynamic-publication.json
fi
SH
cat >bin/timeout <<'SH'
#!/bin/bash
if [[ "$1" == '180' && "$FAIL_LANE" == prereq ]]; then exit 124; fi
if [[ "$RC" == timer && "$*" == *"$TIMER_MATCH"* ]]; then shift 2; exec /usr/bin/timeout --kill-after=0.1s 0.1s "$@"; fi
exec /usr/bin/timeout "$@"
SH
printf '#!/bin/sh\nexit 0\n' >bin/curl
chmod +x bin/*
run() {
 export FAIL_LANE=$1 RC=$2 RECEIPT=$3 GITHUB_EVENT_NAME=$4 TIMER_MATCH=${8:-zzz} SECOND_FAILURE=${9:-no}
 : >calls
 mkdir -p private-runtime-evidence
 rm -f private-runtime-evidence/dynamic-publication-status.json
 # Simulate a stale green receipt from before the current invocation.
 echo '{"savedVersion":true}' >private-runtime-evidence/dynamic-publication.json
 local result=0
 bash "$repo/scripts/qa/runtime-e2e-browser.sh" >/dev/null || result=$?
 local state=absent
 if test -f private-runtime-evidence/dynamic-publication-status.json; then state=$(node -p "require('./private-runtime-evidence/dynamic-publication-status.json').state"); fi
 if [[ "$FAIL_LANE" == publication && "$RC" == 29 ]]; then
   [[ $(node -p "require('./private-runtime-evidence/dynamic-publication-status.json').code") == 29 ]] || return 1
 fi
 local order
 order=$(paste -sd, calls)
 printf '%s %s %s %s => %s %s [%s]\n' "$1" "$2" "$3" "$4" "$result" "$state" "$order"
 [[ $result == "$5" && $state == "$6" && $order == "$7" ]]
}
short=orbit,readme,publication
all=$short,remaining,audit,audit
run none 0 '' schedule 0 passed "$all"
run orbit 23 '' schedule 1 passed "$short"
run readme 24 '' schedule 1 passed "$short"
run orbit timer '' schedule 1 passed "$short" preview-runtime.spec.ts
run publication 29 '' schedule 29 failed "$all"
run publication 29 '' schedule 46 failed "$short,remaining" zzz yes
run publication timer '' schedule 124 timeout_or_killed "$all" private-runtime-dynamic
run remaining 46 '' schedule 46 passed "$short,remaining"
run audit 48 '' schedule 48 passed "$short,remaining,audit"
run none 0 none schedule 1 missing_or_invalid_proof "$all"
run none 0 wrong-sha schedule 1 missing_or_invalid_proof "$all"
run prereq 124 '' schedule 124 not_started ''
run none 0 '' workflow_dispatch 0 absent 'orbit,readme,remaining,audit,audit'
