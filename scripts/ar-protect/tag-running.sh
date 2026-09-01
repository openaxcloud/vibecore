#!/usr/bin/env bash
#
# Pose le tag de protection `running-<package>` sur chaque image que la
# production fait tourner. Lit les références d'image sur l'entrée standard,
# une par ligne.
#
# DEUX défauts corrigés ici, et ils sont indépendants :
#
#   1. DÉRIVATION DU NOM DE PAQUET. Une référence peut être épinglée par tag
#      (`admin:1234abcd`) ou par DIGEST (`admin@sha256:475a…`). Couper au
#      premier `:` seulement donnait `admin@sha256`, et gcloud refusait :
#      « Image …/admin does not match image …/admin@sha256 ». En production
#      les Deployments sont épinglés par digest, donc AUCUNE image n'était
#      taguée. On coupe donc au `@` AVANT de couper au `:`.
#
#   2. UNE IMAGE EN ÉCHEC NE DOIT PAS EMPORTER LES SUIVANTES. Le pas de
#      workflow tournait sous `set -e` : `admin` étant premier dans l'ordre
#      alphabétique, son échec tuait la boucle et les six autres images
#      n'étaient jamais taguées. On ne met donc PAS `-e` ici : on continue,
#      on compte, et on sort en échec à la fin s'il reste des ratés — la
#      panne reste visible, mais elle ne se propage plus.
#
# AR_TAGGER permet aux tests de substituer l'appel gcloud.

set -uo pipefail

REPO="${REPO_CONTAINERS:?REPO_CONTAINERS est requis}"
TAGGER="${AR_TAGGER:-gcloud artifacts docker tags add}"

poses=0
echecs=0
ignorees=0

while read -r img; do
  [ -n "${img:-}" ] || continue

  case "$img" in
    "$REPO"/*) ;;
    *)
      ignorees=$((ignorees + 1))
      continue
      ;;
  esac

  ref="${img#"$REPO"/}"
  pkg="${ref%%@*}"   # forme digest  : admin@sha256:475a…  -> admin
  pkg="${pkg%%:*}"   # forme tag     : admin:1234abcd      -> admin

  if $TAGGER "$img" "$REPO/$pkg:running-$pkg" --quiet; then
    poses=$((poses + 1))
  else
    echo "::error::echec du tag running-$pkg pour $img" >&2
    echecs=$((echecs + 1))
  fi
done

echo "running-* : $poses posés, $echecs en échec, $ignorees hors dépôt"

[ "$echecs" -eq 0 ]
