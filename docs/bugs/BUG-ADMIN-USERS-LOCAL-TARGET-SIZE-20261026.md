---
id: BUG-ADMIN-USERS-LOCAL-TARGET-SIZE-20261026
---

## Bug

Les boutons de tri et le déclencheur de menu d’AdminUsers sont actifs mais trop petits pour la convention locale44px. La nouvelle contrepreuve mesure leurs vraies cibles, disabled false et hit-test central réussi, sur16contextes synthétiques. Les boutons de pagination désactivés sont exclus de ce défaut.

## 📤 Dispatché

☑ 26/10/2026 — Périmètre local UsersPanel/UserRow autorisé après diagnostic et vérification des propriétaires. Revue indépendante favorable.

## 💻 Codé

☐ Sur main. Deux classes locales ajoutent les minima44px en largeur et hauteur aux trois tris et au déclencheur de menu. Aucun handler, état disabled, permission, action ou composant Dropdown partagé changé ; bloc @settings identique octet pour octet après retrait des deux ajouts.

## ✅ Testé live

☐ En production. API GET synthétique uniquement, aucun mot de passe réel, POST, rôle, suspension ou impersonation exécuté.

## Validation locale et preuves

[Diagnostic et contrepreuve](ui-admin-users-targets-2026-10-26/README.md) :64cibles dans16contextes avant/après DOM ;16parcours tri GET/menu Entrée/Escape/focus réussis. Espacement recalculé en excluant un backdrop non interactif ; distance minimale19px entre rectangles, aucune collision affirmée.10tests existants, lint et Prettier verts. Le seuil44px est une convention demandée, pas une conclusion WCAG automatique.

Compilation et recette réelle du correctif source encore attendues ; vérifier table/scroll, menu/viewport et zones internes des cibles. Thèmes demandés non enregistrés comme computedtheme dans le reçu initial : limite explicite à compléter lors de la recette compilée. Main/live restent faux.
