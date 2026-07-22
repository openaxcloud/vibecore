# P0-V3-13 — contrat WCAG 2.2 AA ancré à la spec W3C

**evidenceId :** `docs/deploy-evidence/2026-07-22-wcag-contract/`
Refus « accessibilité UNKNOWN, aucun contrat WCAG 2.2 AA » traité : le contrat manquant
`docs/parity/ACCESSIBILITY_WCAG_CONTRACT.md` (CTR-A11Y-WCAG-2_2-AA) est créé et ancré
verbatim à la spec W3C autoritative (`wcag22-w3c.html` sha256 `6e3c5fe3…`,
https://www.w3.org/TR/WCAG22/, Recommendation 2024-12-12). `verify-wcag-anchor.mjs`
asserte que les 5 critères AA nouveaux de 2.2 (2.4.11, 2.5.7, 2.5.8, 3.3.7, 3.3.8) sont
présents dans la spec ET nommés dans le contrat ; échoue sinon.

> La **mesure** a11y par surface reste `UNKNOWN` (honnête, non devinée) mais est
> désormais **gouvernée par un contrat nommé** — l'audit a11y réel par surface est un
> travail distinct. Le refus « aucun contrat » est levé. PROVEN_REVIEW_PENDING.
