#!/usr/bin/env bash
# Protect distinct references in reusable slots. Repoint surplus slots so an
# ended rollout doesn't exempt a different obsolete digest from age-based GC.
set -uo pipefail
repo=${REPO_CONTAINERS:?}
prefix=${1:-running}
tagger=${AR_TAGGER:-gcloud artifacts docker tags add}
declare -A first count
failed=0
inventory_changed=0

write_tag() {
  local err pods images
  if err=$($tagger "$1" "$2" --quiet 2>&1); then return 0; fi
  # A pod may finish after collection. Only a fresh successful inventory can
  # excuse a missing running reference; desired templates are checked separately.
  if [[ "$prefix" == running && "$err" == *"the referenced version does not exist"* ]]; then
    if pods=$(kubectl get pods -A -o json) &&
       images=$(jq -r -f "$(dirname "$0")/pod-images.jq" <<< "$pods") &&
       ! grep -Fxq -- "$1" <<< "$images"; then
      inventory_changed=1
      echo "::notice::running reference disappeared: $1"
      return 0
    fi
  fi
  echo "::error::failed to protect $1 with $2" >&2
  printf '%s\n' "$err" >&2
  failed=1
}

# Caller supplies sorted, unique references after completing inventory.
while IFS= read -r img; do
  [[ "$img" == "$repo/"* ]] || continue
  ref=${img#"$repo"/}
  pkg=${ref%%@*}
  pkg=${pkg%%:*}
  slot=$(( ${count[$pkg]:-0} + 1 ))
  count[$pkg]=$slot
  tag="$prefix-$pkg"
  if ((slot == 1)); then first[$pkg]=$img; else tag="$tag-slot-$slot"; fi
  write_tag "$img" "$repo/$pkg:$tag"
done

# Only move our numbered tags, after all required writes succeeded.
if ((failed == 0 && inventory_changed == 0)); then
  for pkg in "${!first[@]}"; do
    if ! tags=$(gcloud artifacts docker tags list "$repo/$pkg" --format='value(tag)' --quiet); then
      echo "::error::cannot enumerate $prefix slots for $pkg" >&2
      failed=1
      continue
    fi
    while IFS= read -r tag; do
      tag=${tag##*/}
      tag=${tag##*:}
      stem="$prefix-$pkg-slot-"
      [[ "$tag" == "$stem"* ]] || continue
      n=${tag#"$stem"}
      if [[ "$n" =~ ^[1-9][0-9]{0,5}$ ]] && ((n > count[$pkg])); then
        write_tag "${first[$pkg]}" "$repo/$pkg:$tag"
      fi
    done <<< "$tags"
  done
fi
exit "$failed"
