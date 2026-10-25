---
id: BUG-DASHBOARD-PALETTE-WIDTH-20261025
---

## Bug

Dashboard 320px avec nom de projet long : listbox 269px, chaque résultat 1317,656px, bord droit 1343,156px. Le débordement est masqué par la coquille ; intitulés et indication Entrée sont coupés. La largeur minimale automatique des éléments de la grille est imposée par le texte long.

## 📤 Dispatché

25 octobre 2026 : diagnostic transmis au parent. Correction préparée seulement après fusion #788, sans relance de sa CI. Intégration sémantique locale de main `d09045d5a` après #791 : routes `/ide?panel=deployments` et `/ide?panel=domains` de #788 conservées. La comparaison indépendante avec main ne montre que les deux ajustements de classes attendus.

## 💻 Codé

Pas sur main. Correction locale : `min-w-0` sur les liens résultats, espacement explicite entre type et indication Entrée ; indication non rétrécie. Le contexte a été comparé avec main après #788. Aucun changement de navigation commune.

## ✅ Testé live

Non. Contre-épreuve CSS temporaire dans Chromium local avec fixture synthétique : résultats ramenés à 269px, bord droit 294,5px, scrollWidth269. Les recettes du correctif produit compilé sont archivées séparément ; aucune recette production.

## Preuves

[Avant](user-area-2026-10-25/deferred/palette-before320.png), [contre-épreuve](user-area-2026-10-25/deferred/palette-proposed320.png), [mesures](user-area-2026-10-25/deferred/palette-before.json), [patch proposé non appliqué](user-area-2026-10-25/deferred/palette-min-width-proposed.patch).

[Correctif compilé, captures et matrice locale](user-area-2026-10-25/palette/README.md).
