---
id: BUG-DASHBOARD-PALETTE-WIDTH-20261025
---

## Bug

Dashboard 320px avec nom de projet long : listbox 269px, chaque résultat 1317,656px, bord droit 1343,156px. Le débordement est masqué par la coquille ; intitulés et indication Entrée sont coupés. La largeur minimale automatique des éléments de la grille est imposée par le texte long.

## 📤 Dispatché

25 octobre 2026 : diagnostic transmis au parent ; `app/components/dashboard/SaaSLayout.tsx` est réservé à la session #788. Aucune modification appliquée à ce fichier ni relance CI #788.

## 💻 Codé

Non. Proposition locale séparée : ajouter `min-w-0` aux liens des résultats, autour de la ligne 2342 sur base `5ee605bf3`. Ne pas appliquer aveuglément après #788 : recontrôler son contexte. Les récents utilisent une structure similaire mais ne sont pas corrigés par cette proposition minimale.

## ✅ Testé live

Non. Contre-épreuve CSS temporaire dans Chromium local avec fixture synthétique : résultats ramenés à 269px, bord droit 294,5px, scrollWidth269. Ce n'est pas un correctif produit ni une recette production.

## Preuves

[Avant](user-area-2026-10-25/deferred/palette-before320.png), [contre-épreuve](user-area-2026-10-25/deferred/palette-proposed320.png), [mesures](user-area-2026-10-25/deferred/palette-before.json), [patch proposé non appliqué](user-area-2026-10-25/deferred/palette-min-width-proposed.patch).
