#!/usr/bin/env bash
# A protection name encodes exactly one digest. Never copy from a movable tag.
set -euo pipefail
img=$1
prefix=$2
package=$3
if [[ "$img" == *@* ]]; then
  digest=${img##*@}
else
  digest=$(gcloud artifacts docker images describe "$img" --format='value(image_summary.digest)')
fi
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid digest for $img" >&2; exit 1; }
${AR_TAGGER:-gcloud artifacts docker tags add} "$package@$digest" "$package:$prefix-sha256-${digest#sha256:}" --quiet
