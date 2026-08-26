#!/usr/bin/env bash

set -euo pipefail

if [[ "$*" == *'--list'* ]]; then
  count="${FAKE_RUNTIME_TEST_COUNT:?}"

  for ((index = 1; index <= count; index += 1)); do
    printf '  [chromium] › sample.spec.ts:1:1 › runtime test %d\n' "${index}"
  done

  printf 'Total: %d tests in 1 file\n' "${count}"
  exit 0
fi

printf '%s\n' "$*" >>"${FAKE_RUNTIME_RUN_LOG:?}"
