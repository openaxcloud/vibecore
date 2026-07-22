#!/usr/bin/env bash
# Preuve NÉGATIVE rejouable de la garde P0-B-01 (overlay des 159 surfaces).
# Chaque mutation d'un fait doit CASSER le build ; la restauration doit revenir vert.
# Usage: PARITY_DEPS=/chemin/vers/deps bash scripts/parity/prove-surface-overlay-guard.sh
set -u
cd "$(dirname "$0")/../.." || exit 2
FACTS=docs/parity/IMPLEMENTATION_FACTS.yaml
SURF=docs/parity/SURFACE_REGISTRY.yaml
GEN="node scripts/parity/generate-implementation-status.mjs"
VAL="node scripts/parity/validate-registries.mjs"
tmp=$(mktemp -d)
cp "$FACTS" "$tmp/facts" ; cp "$SURF" "$tmp/surf"
restore() { cp "$tmp/facts" "$FACTS" ; cp "$tmp/surf" "$SURF" ; }
trap restore EXIT
pass=0 ; fail=0
expect_break() { # $1=label ; runs $2 ; must exit non-zero
  if eval "$2" >/dev/null 2>&1 ; then echo "  ✗ $1 : n'a PAS cassé (attendu: échec)"; fail=$((fail+1)); else echo "  ✓ $1 : a cassé comme attendu"; pass=$((pass+1)); fi
}

echo "NEG-1 — retirer une surface canonique (P080) des faits :"
restore
perl -0pi -e 's/- itemId: P080\b.*?(?=\n- itemId:)//s' "$FACTS"
expect_break "génération refuse un univers rétréci" "$GEN"

echo "NEG-2 — codeRef fantôme sur un item construit (P002 CODED) :"
restore
perl -0pi -e 's{codeRefs: app/routes/organization-switcher\.tsx[^\n]*}{codeRefs: app/routes/CE_FICHIER_NEXISTE_PAS.tsx}s' "$FACTS"
expect_break "génération refuse un builtState non justifié" "$GEN"

echo "NEG-3 — builtState divergent dans surfaceUniverse (P001 built->absent) :"
restore
perl -0pi -e 's/builtState: built          # PROVEN \(overlay IMPLEMENTATION_STATUS#P001\)/builtState: absent          # PROVEN (overlay IMPLEMENTATION_STATUS#P001)/' "$SURF"
expect_break "validateur refuse la dérive surfaceUniverse<->overlay" "$VAL"

echo "CONTRÔLE — après restauration, la génération et le validateur sont VERTS :"
restore
if $GEN >/dev/null 2>&1 && $VAL >/dev/null 2>&1 ; then echo "  ✓ vert restauré"; pass=$((pass+1)); else echo "  ✗ non vert après restauration"; fail=$((fail+1)); fi

echo ""
echo "RÉSULTAT: $pass OK / $fail KO"
[ "$fail" -eq 0 ]
