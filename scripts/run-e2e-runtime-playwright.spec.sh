#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "${test_root}"' EXIT

mkdir -p "${test_root}/bin"
ln -s "${repo_root}/scripts/test-fixtures/e2e-runtime-fake-pnpm.sh" "${test_root}/bin/pnpm"

export PATH="${test_root}/bin:${PATH}"
export FAKE_RUNTIME_RUN_LOG="${test_root}/runs"

export FAKE_RUNTIME_TEST_COUNT=16
if "${repo_root}/scripts/run-e2e-runtime-playwright.sh" >/dev/null 2>&1; then
  echo 'runtime coverage floor unexpectedly accepted 16 tests' >&2
  exit 1
fi
[[ ! -e "${FAKE_RUNTIME_RUN_LOG}" ]]

export FAKE_RUNTIME_TEST_COUNT=17
"${repo_root}/scripts/run-e2e-runtime-playwright.sh" >/dev/null
[[ "$(<"${FAKE_RUNTIME_RUN_LOG}")" == 'exec playwright test tests/e2e/sample.spec.ts:1 --project=chromium --grep @runtime' ]]

echo 'E2E runtime Playwright gate tests passed'
