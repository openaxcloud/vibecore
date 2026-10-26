---
id: BUG-REPORT-ABUSE-LINK-CONTRAST-20261026
---

## Bug

Les liens « Conditions d’utilisation » et « Règles de la communauté » de ReportAbuse utilisent la couleur primaire orange en thème clair : rgb(245,101,5) sur fond opaque rgb(252,252,252), ratio sRGB 3,034:1. Leur texte normal mesure 14 px à 320 et 12 px à 1440, sous le seuil indicatif 4,5:1. Reproduit en FR et EN.

## 📤 Dispatché

☑ 26/10/2026 — Diagnostic local ciblé remonté au parent ; correction locale autorisée.32 PR ouvertes contrôlées avec pagination, aucun chevauchement de ReportAbuse.tsx.

## 💻 Codé

☐ Sur main. Deux classes `text-primary` deviennent `text-[var(--ecode-accent-text)]` dans ReportAbuse.tsx. Token existant, aucun token global ni composant partagé modifié. Textes juridiques et href `/terms` et `/acceptable-use` inchangés.

## ✅ Testé live

☐ En production. API synthétique et navigateur local uniquement ; aucun POST, signalement, backend réel ni tiers atteint.

## Validation locale et preuves

[Diagnostic et contrepreuve](ui-report-abuse-contrast-2026-10-26/README.md) : huit contextes FR/EN × clair/sombre × 320/1440. Le token existant donne rgb(169,65,0) en clair, ratio 5,94:1 sur rgb(252,252,252), et rgb(255,138,61) en sombre, ratio 7,77:1. Contrepreuve DOM uniquement ; compilation et recette du correctif source attendues dans le build commun.

Cinq tests existants ReportAbuse réussis, lint et formatage ciblés verts. Aucun test miroir CSS ajouté. Le diagnostic initial plus large conserve explicitement les gradients/transparences non évalués et le faux signal Reset exclu. Aucune certification WCAG globale ni validation d’erreur soumise.

## Recette compilée finale

[Après 13999](ui-report-abuse-contrast-2026-10-26/after13999/README.md), build `cc5574d67` : huit contextes FR/EN × clair/sombre × 320/1440, seize mesures réelles sans injection DOM. Clair 5,9449:1 ; sombre 7,7688:1. Zéro erreur JS/échec. Le défaut ciblé est corrigé et validé localement sur build ; main/live restent faux. Les exclusions initiales et limites globales restent applicables.
