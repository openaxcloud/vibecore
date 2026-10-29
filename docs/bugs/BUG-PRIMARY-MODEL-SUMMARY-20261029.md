---
id: BUG-PRIMARY-MODEL-SUMMARY-20261029
section: "Agent et messages"
---

# Le résumé du modèle principal contredit le choix explicite

## 📤 Dispatché

☑ 29/10 — désaccord observé après rechargement, investigation isolée.

## 💻 Codé

☐ — branche séparée, non fusionnée.

## ✅ Testé live

☐ — aucune recette production du correctif.

## Défaut

La carte Lite et sa radio indiquent le modèle explicitement choisi, tandis que
l'entrée « Primary model — Lite » affiche toujours « Auto · default ».
`FeuilleDesModes` rend une traduction constante pour cette entrée, sans lire le
choix utilisé par les deux autres surfaces. Le budget n'est pas en cause.

## Périmètre

Lire le choix du mode actif pour le résumé, sans modifier la sélection, le
routage, les sondes, les permissions ni les plafonds. Conserver le texte Auto
lorsque le choix est automatique et distinguer une variante rapide explicite.

## Validation

- Avant correction : 6 régressions rouges, 17 tests verts, sur les vrais composants.
- Après correction : 82 tests verts dans 8 fichiers, dont persistance/remontage,
  présentation mobile/bureau, modes, navigation entre projets, retour Auto,
  variante rapide, traductions française/anglaise et inventaire.
- Revue indépendante : 23 tests rejoués et avis produit favorable.
- Le budget est une lecture synthétique laissée en attente dans le test de
  changement de projet ; aucun appel réseau réel. Le choix par mode conserve
  sa portée navigateur existante : aucun nouveau stockage par projet.
- Le résumé décrit le choix demandé, pas une preuve du modèle réellement servi.
  La notice de repli demeure séparée et inchangée.
  Les tests isolés n'effectuent aucun appel fournisseur et ne prouvent pas une
  modification du projet utilisateur ni une version déployée.
