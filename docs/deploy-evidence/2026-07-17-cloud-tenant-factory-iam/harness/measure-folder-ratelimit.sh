#!/bin/bash
# Measure the real GCP folder-creation rate limit under a TEST folder.
# Phase 1: burst of 20 back-to-back POST /v3/folders (timestamps + HTTP codes)
# Phase 2: probe every 10s for 120s to observe the refill pace.
# Measured 2026-07-17 under folders/780512954993: first 429 at request #10,
# sustained 23 creations / 236.3s = 5.8/min (0.097 req/s),
# error = "Folder V3 create requests per minute". Clean up the test folders
# afterwards (delete is also rate-limited; retry with backoff).
PARENT="${PARENT:-folders/780512954993}"
TOKEN=$(gcloud auth print-access-token)
OUT="${OUT:-/tmp/folder-ratelimit-results.jsonl}"
: > "$OUT"
call() {
  local name="$1"
  local t0=$(python3 -c 'import time; print(f"{time.time():.3f}")')
  local resp
  resp=$(curl -s -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"parent\":\"$PARENT\",\"displayName\":\"$name\"}" \
    "https://cloudresourcemanager.googleapis.com/v3/folders")
  local t1=$(python3 -c 'import time; print(f"{time.time():.3f}")')
  local code=$(echo "$resp" | tail -1)
  local body=$(echo "$resp" | sed '$d' | tr -d '\n' | head -c 300)
  echo "{\"name\":\"$name\",\"t0\":$t0,\"t1\":$t1,\"http\":$code,\"body\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$body")}" >> "$OUT"
  echo "$code"
}
echo "=== PHASE 1: burst of 20 ==="
for i in $(seq 1 20); do echo "burst $i -> $(call "rl-burst-$i")"; done
echo "=== PHASE 2: refill probe every 10s for 120s ==="
for i in $(seq 1 12); do sleep 10; echo "refill $i -> $(call "rl-refill-$i")"; done
echo "=== DONE. results in $OUT ==="
