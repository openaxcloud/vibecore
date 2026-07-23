#!/usr/bin/env bash
# P0-LS-03 — test négatif REJOUABLE du garde d'intégrité du paquet livescan.
#
# Prouve que `verify-livescan-hashes.mjs --check` (câblé dans le job `validate`
# de .github/workflows/parity-registries.yml) DEVIENT ROUGE dès qu'un fichier du
# paquet livescan est altéré d'un seul octet, puis REDEVIENT VERT à la
# restauration. Sans cette preuve, un vérificateur « toujours vert » ne garde
# rien (refus expert RR-20260722-CODEX-06).
#
#   bash scripts/parity/prove-livescan-hash-guard.sh
#
# Sortie : « ROUGE sur modif / VERT sur restauration » + exit 0 si le garde
# fonctionne, exit 1 sinon.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

VERIFIER="docs/deploy-evidence/2026-07-22-livescan-hashes/verify-livescan-hashes.mjs"
SCAN_DIR="docs/parity/livescan-2026-07-20"

# On altère un fichier de LIENS — c'est précisément la classe (21 *.links.txt)
# que le refus expert exigeait de hasher.
TARGET="$(ls "$SCAN_DIR"/*.links.txt 2>/dev/null | sort | head -n1)"
if [[ -z "${TARGET:-}" ]]; then
  echo "FATAL : aucun *.links.txt trouvé dans $SCAN_DIR" >&2
  exit 1
fi

BACKUP="$(mktemp)"
cp "$TARGET" "$BACKUP"

restore() { cp "$BACKUP" "$TARGET"; rm -f "$BACKUP"; }
trap restore EXIT

echo "== Cible du test négatif : $TARGET"
echo

# --- Étape 0 : état de départ VERT ---
echo "-- [0] Baseline : --check sur l'arbre intact doit être VERT"
if ! node "$VERIFIER" --check; then
  echo "FATAL : la baseline est déjà ROUGE — l'arbre n'est pas propre." >&2
  exit 1
fi
echo

# --- Étape 1 : altération d'UN octet -> le garde doit devenir ROUGE ---
echo "-- [1] Altération d'un octet -> --check doit sortir NON-ZÉRO (ROUGE)"
printf 'X' >> "$TARGET"          # +1 octet => sha256 différent de l'index committé
set +e
node "$VERIFIER" --check
RED_EXIT=$?
set -e 2>/dev/null || true
echo "   exit après modif = $RED_EXIT"
if [[ "$RED_EXIT" -eq 0 ]]; then
  echo "ÉCHEC : le garde est resté VERT malgré une altération -> il ne garde rien." >&2
  exit 1
fi
echo "   OK : ROUGE sur modif."
echo

# --- Étape 2 : restauration -> le garde doit redevenir VERT ---
echo "-- [2] Restauration -> --check doit repasser VERT (exit 0)"
restore
trap - EXIT
set +e
node "$VERIFIER" --check
GREEN_EXIT=$?
set -e 2>/dev/null || true
echo "   exit après restauration = $GREEN_EXIT"
if [[ "$GREEN_EXIT" -ne 0 ]]; then
  echo "ÉCHEC : le garde est resté ROUGE après restauration." >&2
  exit 1
fi
echo "   OK : VERT sur restauration."
echo

echo "RÉSULTAT : ROUGE sur modif ($RED_EXIT) / VERT sur restauration ($GREEN_EXIT) — garde P0-LS-03 fonctionnel."
exit 0
