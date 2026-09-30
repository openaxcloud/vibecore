#!/bin/bash
# Banc iOS — zoom Safari au toucher (XCUITest, vrai doigt, vrai clavier).
# Usage : tests/ios-sim/zoom.sh [UDID]   — sort 0 si les 3 tests passent.
# Éteint le simulateur et le serveur de la page à la fin (machine à 8 Go).
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
U="${1:-$(xcrun simctl list devices -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for v in d.values() for x in v if x['name']=='vc-banc-ios-390'))")}"
SORTIE="${SORTIE:-$ICI/../../test-results/ios-sim}"; mkdir -p "$SORTIE"
( cd "$ICI/page-zoom" && exec python3 -m http.server 8765 --bind 127.0.0.1 ) >/dev/null 2>&1 & SERVEUR=$!
trap 'kill $SERVEUR 2>/dev/null; xcrun simctl shutdown "$U" >/dev/null 2>&1' EXIT
xcrun simctl boot "$U" >/dev/null 2>&1
rm -rf "$SORTIE/zoom.xcresult"
TEST_RUNNER_BANC_URL=http://127.0.0.1:8765/index.html xcodebuild test \
  -project "$ICI/xcuitest/BancIOS.xcodeproj" -scheme BancIOS \
  -destination "platform=iOS Simulator,id=$U" -resultBundlePath "$SORTIE/zoom.xcresult" > "$SORTIE/zoom.log" 2>&1
RC=$?
grep -E "BANC-MESURE|Test Case .*(passed|failed)|\*\* TEST (SUCCEEDED|FAILED) \*\*" "$SORTIE/zoom.log"
exit $RC
