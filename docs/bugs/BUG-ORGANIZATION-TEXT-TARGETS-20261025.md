---
id: BUG-ORGANIZATION-TEXT-TARGETS-20261025
---

## Bug

Noms de rôles coupés et cibles locales trop petites. Quatre routes coupent les noms de rôles non sécables malgré un document contenu. Les labels de permissions mesurent33px à1440px au lieu de l’objectif local44px (rem réduit), sans déduire une violation WCAG automatique.

## 📤 Dispatché

Mission UI globale, complément isolé pendant CI/livraison #792 et #795. Périmètres concurrents inspectés et conservés.

## 💻 Codé

Correctif local uniquement, pas sur main : Wrapping local sur quatre routes et hauteur explicite44px sur les labels concernés. Aucun changement de permission, action ou navigation.

## ✅ Testé live

Non. Navigateur local et fixtures synthétiques ; aucune mutation cliente, création d’accès, invitation ou envoi réel.

## Preuves

80observations et7parcours compilés pour le wrapping ;228labels activés et restaurés pour la preuve initiale de cible. Recette finale compilée9899 :12observations,228labels activés/restaurés,44pxminimum, zéro mutation. [Matrice et limites](user-area-tertiary-2026-10-25/README.md).
