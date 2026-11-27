#!/usr/bin/env bash
# A protection name encodes exactly one digest. Never copy from a movable tag.
set -euo pipefail
img=$1
prefix=$2
package=$3
if [[ "$img" == *@* ]]; then
  digest=${img##*@}
else
  # Artifact Registry v1 packages.tags.get returns {name, version}. Encode a
  # nested Docker package as one resource segment and verify the complete parent.
  IFS=/ read -r host project repository path <<< "$package"
  [[ "$host" =~ ^([a-z0-9-]+)-docker\.pkg\.dev$ && -n "$project" && -n "$repository" && -n "$path" ]] ||
    { echo "invalid Artifact Registry package: $package" >&2; exit 1; }
  location=${host%-docker.pkg.dev}
  tag=${img##*:}
  [[ "$img" == "$package:$tag" && "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] ||
    { echo "expected an explicit Docker tag for $img" >&2; exit 1; }
  parent="projects/$project/locations/$location/repositories/$repository/packages/$(jq -rn --arg p "$path" '$p|@uri')"
  name="$parent/tags/$tag"
  # Send the auth header via stdin, never in curl's argv or logs. No redirects.
  response=$(gcloud auth print-access-token | sed 's/^/Authorization: Bearer /' |
    curl -qfsS --header @- --url "https://artifactregistry.googleapis.com/v1/$name")
  digest=$(jq -ser --arg name "$name" --arg parent "$parent/versions/" '
    if length == 1 and .[0].name == $name and (.[0].version | startswith($parent))
    then .[0].version | ltrimstr($parent)
    else error("unexpected Artifact Registry Tag resource") end' <<< "$response")
fi
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid digest for $img" >&2; exit 1; }
${AR_TAGGER:-gcloud artifacts docker tags add} "$package@$digest" "$package:$prefix-sha256-${digest#sha256:}" --quiet
