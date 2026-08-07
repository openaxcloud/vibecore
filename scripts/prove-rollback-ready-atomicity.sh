#!/usr/bin/env bash
#
# Replayable proof for the expert counter-audit: READY ↔ ReleaseManifest atomicity.
#
# It runs ONE spec twice against the SAME working tree:
#
#   RED   the spec vs. the code with the fix REVERTED (git stash of the two source
#         files only — the spec itself stays in place). The crash-injection tests on
#         the real transitions must FAIL, and they must fail with the two fail-OPEN
#         shapes the refusal described: `rollbackable` ABSENT, or INHERITED true.
#   GREEN the spec vs. the code with the fix applied. All tests pass.
#
# A test that is green in both states proves nothing; RED-then-GREEN is the point.
#
# Usage:  bash scripts/prove-rollback-ready-atomicity.sh
# Needs:  a clean-ish worktree (the script stashes/restores only the two fixed files).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/services/api"
SPEC="src/tests/rollback-ready-transition-crash.spec.ts"
FIXED_SOURCES=("services/api/src/app.ts" "services/api/src/deployments.ts")

cd "$ROOT"

echo "=== SHA under proof ==============================================="
git rev-parse HEAD
git status --porcelain -- "${FIXED_SOURCES[@]}"
echo

run_spec() {
  # Drop the API's JSON request logs so the assertion output is readable.
  (cd "$API" && npx vitest --run --config vitest.config.ts \
     --pool=forks --poolOptions.forks.singleFork=true "$SPEC" 2>&1) | grep -vE '^\{"level"'
}

echo "=== [1/2] RED — fix reverted, spec unchanged ======================="
git stash push --quiet -m "prove-rollback-atomicity" -- "${FIXED_SOURCES[@]}"
STASHED=$?

if [ "$STASHED" -ne 0 ]; then
  echo "nothing to stash: the fix is not present in the working tree; RED phase is not meaningful." >&2
fi

run_spec | tee /tmp/rollback-atomicity-RED.txt
echo

# Always put the fix back, even if the RED run exploded.
if [ "$STASHED" -eq 0 ]; then
  git stash pop --quiet
fi

echo "=== [2/2] GREEN — fix applied ======================================"
run_spec | tee /tmp/rollback-atomicity-GREEN.txt
echo

echo "=== Verdict ======================================================="
echo "RED   : $(grep -E '^ +Tests +' /tmp/rollback-atomicity-RED.txt   | tail -1)"
echo "GREEN : $(grep -E '^ +Tests +' /tmp/rollback-atomicity-GREEN.txt | tail -1)"
echo
echo "Fail-open shapes observed in the RED run (both must appear):"
grep -oE 'rollbackable must be false, got (undefined|true)' /tmp/rollback-atomicity-RED.txt | sort | uniq -c
