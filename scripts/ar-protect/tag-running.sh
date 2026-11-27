#!/usr/bin/env bash
set -uo pipefail
repo=${REPO_CONTAINERS:?}
prefix=${1:-running}
failed=0

write_tag() {
  local err pods images
  if err=$("$(dirname "$0")/pin-image.sh" "$1" "$prefix" "$2" 2>&1); then return 0; fi
  # A pod may finish after collection. Only a fresh successful inventory can
  # excuse a missing running reference; desired templates are checked separately.
  if [[ "$prefix" == running && "$err" == *"the referenced version does not exist"* ]]; then
    if pods=$(kubectl get pods -A -o json) &&
       images=$(jq -r -f "$(dirname "$0")/pod-images.jq" <<< "$pods") &&
       ! grep -Fxq -- "$1" <<< "$images"; then
      echo "::notice::running reference disappeared: $1"
      return 0
    fi
  fi
  echo "::error::failed to protect $1 ($prefix)" >&2
  printf '%s\n' "$err" >&2
  failed=1
}

while IFS= read -r img; do
  [[ "$img" == "$repo/"* ]] || continue
  ref=${img#"$repo"/}
  pkg=${ref%%@*}
  write_tag "$img" "$repo/${pkg%%:*}"
done
exit "$failed"
