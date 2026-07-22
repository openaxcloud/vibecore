# ACCESSIBILITY_WCAG_CONTRACT — contrat d'accessibilité WCAG 2.2 AA (P0-V3-13)

schemaVersion: 1
contractId: CTR-A11Y-WCAG-2_2-AA
Ancrage : `docs/deploy-evidence/2026-07-22-wcag-contract/` (spec W3C committée
`wcag22-w3c.html` sha256 `6e3c5fe3…`, source autoritative
`https://www.w3.org/TR/WCAG22/`, W3C Recommendation 2024-12-12). Vérifiable :
`node docs/deploy-evidence/2026-07-22-wcag-contract/verify-wcag-anchor.mjs --offline`.

## Portée
Ce contrat DÉFINIT le standard d'accessibilité que les surfaces produit E-Code
(`SURFACE_REGISTRY.yaml`) doivent atteindre : **WCAG 2.2 niveau AA** (A + AA).
Il **nomme** l'exigence là où `accessibilityContract` valait `UNKNOWN`. La *mesure*
par surface (audit a11y réel) reste `UNKNOWN` tant qu'elle n'est pas exécutée — jamais
devinée (règle du registre) — mais elle est désormais **gouvernée par ce contrat nommé**.

## Niveau de conformité
Trois niveaux W3C : **A (le plus bas), AA, AAA (le plus haut)**. La cible E-Code est
**AA** (inclut tous les critères de niveau A + AA).

## Critères AA nouveaux en WCAG 2.2 (ancrés verbatim à la spec W3C)
| # | critère (verbatim W3C) | niveau |
|---|---|---|
| 2.4.11 | Focus Not Obscured (Minimum) | AA |
| 2.5.7 | Dragging Movements | AA |
| 2.5.8 | Target Size (Minimum) | AA |
| 3.3.7 | Redundant Entry | AA |
| 3.3.8 | Accessible Authentication (Minimum) | AA |

(Les critères A/AA hérités de WCAG 2.1 restent intégralement applicables ; la spec
committée en est la source autoritative.)

## Référence depuis les surfaces
Une surface conforme référence `accessibilityContract: CTR-A11Y-WCAG-2_2-AA`.
Une surface **non encore mesurée** conserve `accessibilityContract: UNKNOWN`
(honnête) — ce contrat est le standard cible, la mesure est un travail distinct.

## Statut
`P0-V3-13` — **PROVEN_REVIEW_PENDING** : le contrat WCAG 2.2 AA manquant est créé et
ancré à la source W3C autoritative (rejouable). La mesure par surface reste à exécuter
(UNKNOWN honnête, gouverné par ce contrat). Ne pas clôturer sans re-signature.
