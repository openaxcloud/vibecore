#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly MIN_RUNTIME_TESTS=17

runtime_listing="$(pnpm exec playwright test tests/e2e --project=chromium --grep @runtime --list)"
runtime_test_count="$(awk '/^  \[chromium\] › / { count += 1 } END { print count + 0 }' <<<"${runtime_listing}")"

if [[ "${runtime_test_count}" -lt "${MIN_RUNTIME_TESTS}" ]]; then
  echo "runtime E2E coverage shrank to ${runtime_test_count} tests; expected at least ${MIN_RUNTIME_TESTS}" >&2
  exit 1
fi

runtime_cases="$({
  sed -nE 's/^  \[chromium\] › ([^:]+\.spec\.ts:[0-9]+):[0-9]+ › .*/tests\/e2e\/\1/p' <<<"${runtime_listing}" |
    sort -u
})"

if [[ -z "${runtime_cases}" ]]; then
  echo 'no @runtime Playwright tests were discovered' >&2
  exit 1
fi

case_count="$(printf '%s\n' "${runtime_cases}" | wc -l | tr -d ' ')"
echo "discovered ${runtime_test_count} @runtime tests across ${case_count} execution locations"

case_index=0

while IFS= read -r runtime_case; do
  case_index=$((case_index + 1))

  # Bound pod/PVC pressure on the small ephemeral kind node. A failed test may
  # be retried with a fresh project, so an entire spec can otherwise accumulate
  # enough live workspaces to starve the tests that follow. The final case stays
  # running long enough for evidence collection before cluster teardown.
  if [[ "${case_index}" -gt 1 ]]; then
    scripts/e2e-runtime-cluster.sh purge-workspaces
  fi

  echo "running @runtime test ${case_index}/${case_count}: ${runtime_case}"
  pnpm exec playwright test "${runtime_case}" --project=chromium --grep @runtime
done <<<"${runtime_cases}"
