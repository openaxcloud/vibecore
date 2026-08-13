#!/usr/bin/env bash
#
# Replayable proof for the expert counter-audit: READY ↔ ReleaseManifest atomicity.
#
# It runs ONE spec twice against the SAME checkout:
#
#   RED   the spec vs. the code with the fix REVERTED — the two fixed source files are
#         checked out from the PARENT commit (the refused SHA), while the spec itself,
#         which did not exist there, stays in place. The crash-injection tests on the
#         real transitions must FAIL, with the two fail-OPEN shapes the refusal
#         described: `rollbackable` ABSENT, or INHERITED true.
#   GREEN the spec vs. the code at HEAD. All tests pass.
#
# A test that is green in both states proves nothing; RED-then-GREEN is the point.
#
# Usage:  bash scripts/prove-rollback-ready-atomicity.sh
# Needs:  the two fixed source files committed and unmodified in the worktree.

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

# Référence AVANT-lot. `HEAD^` ne convient pas : au fil des commits de preuve, le parent
# immédiat contient déjà le correctif et la phase ROUGE devient muette. On prend donc la
# base sur laquelle le lot a été rebasé (origin/main), qui ne contient rien du lot.
# Surchargeable : BASELINE=<ref> bash scripts/prove-rollback-ready-atomicity.sh
PARENT="$(git rev-parse "${BASELINE:-origin/main}")"

echo "=== [1/2] RED — sources ramenées à $PARENT (avant-lot), spec inchangée ====="
# Always put the fix back, even if the RED run explodes or the script is interrupted.
trap 'git checkout --quiet HEAD -- "${FIXED_SOURCES[@]}"' EXIT INT TERM
git checkout --quiet "$PARENT" -- "${FIXED_SOURCES[@]}"

run_spec | tee /tmp/rollback-atomicity-RED.txt
echo

git checkout --quiet HEAD -- "${FIXED_SOURCES[@]}"
trap - EXIT INT TERM

echo "=== [2/2] GREEN — fix applied ======================================"
run_spec | tee /tmp/rollback-atomicity-GREEN.txt
echo

echo "=== Verdict ======================================================="
echo "RED   : $(grep -E '^ +Tests +' /tmp/rollback-atomicity-RED.txt   | tail -1)"
echo "GREEN : $(grep -E '^ +Tests +' /tmp/rollback-atomicity-GREEN.txt | tail -1)"
echo
echo "Fail-open shapes observed in the RED run (both must appear):"
grep -oE 'rollbackable must be false, got (undefined|true)' /tmp/rollback-atomicity-RED.txt | sort | uniq -c
