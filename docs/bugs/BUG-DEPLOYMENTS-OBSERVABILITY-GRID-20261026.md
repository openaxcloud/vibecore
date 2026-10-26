---
id: BUG-DEPLOYMENTS-OBSERVABILITY-GRID-20261026
---

## Bug

La grille Observabilité de `/marketing/deployments` possède une piste implicite de 320,53 px dans un conteneur de 272 px à CSS320. Le paragraphe atteint x337,77 et est coupé, malgré une largeur de document contenue. Reproduit par public_ui_audit à zoom navigateur 100 % et 200 %.

## 📤 Dispatché

☑ 26/10/2026 — Cause et contrepreuve DOM transmises par public_ui_audit ; delta local autorisé et revu indépendamment par final_review.

## 💻 Codé

☐ Sur main. Une classe `grid-cols-1` ajoutée au seul conteneur Observabilité de PublicDeploymentsSections.tsx ; override desktop lg conservé. Aucun contenu, CTA, composant partagé ou style global changé.

## ✅ Testé live

☐ En production. Diagnostic Chromium local sur API synthétique ; aucun backend réel, mutation ou déploiement client.

## Validation locale et preuves

[Preuves copiées et contrôles](ui-deployments-observability-grid-2026-10-26/README.md) : contrepreuve DOM minmax(0,1fr), Range x337,77→276,21 à CSS320 aux deux niveaux de zoom.11 tests existants, lint et Prettier réussis. Revue indépendante favorable ; recette du build commun encore attendue, comprenant les éléments internes FR/EN et les deux colonnes lg. Les preuves DOM ne constituent pas une recette compilée ni une certification globale.
