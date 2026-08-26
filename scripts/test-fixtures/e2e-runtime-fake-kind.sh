#!/usr/bin/env bash

set -euo pipefail

case "${1:-} ${2:-}" in
  'get clusters')
    if [[ -s "${KIND_FAKE_STATE_FILE:?}" ]]; then
      cat "${KIND_FAKE_STATE_FILE}"
    fi
    ;;
  'delete cluster')
    if [[ "${3:-}" != '--name' || -z "${4:-}" ]]; then
      echo 'unexpected fake kind delete arguments' >&2
      exit 2
    fi

    printf '%s\n' "${4}" >>"${KIND_FAKE_DELETE_LOG:?}"
    : >"${KIND_FAKE_STATE_FILE:?}"
    ;;
  *)
    echo "unsupported fake kind invocation: $*" >&2
    exit 2
    ;;
esac
