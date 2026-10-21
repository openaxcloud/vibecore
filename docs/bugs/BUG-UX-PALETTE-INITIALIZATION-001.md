---
id: BUG-UX-PALETTE-INITIALIZATION-001
---

# La palette du composeur disparaît pendant l’initialisation sur tablette

## 📤 Dispatché

Recette combinée main fc8a687e + #750 e996671 + #753 f06923ff. Dépendance au chantier éditeur/BaseChat ; ne pas modifier ses chemins en parallèle.

## 💻 Codé

Non corrigé. Ne pas remplacer le geste par un force-click ou attendre arbitrairement plus longtemps. La disparition/remontée du composeur pendant la vérification de session est une piste à instrumenter avec le propriétaire de BaseChat, pas une cause démontrée.

## ✅ Testé live

Reproduit localement dans le cas du menu ••• à 820 px : après l’ouverture de Design palette et un appui à l’intérieur, la surface disparaît. La capture DOM montre Checking the active session et Loading E-Code, avec un composeur sans bouton Envoyer. Le même cas passait au premier passage combiné. La couleur du micro est un défaut de synchronisation de test distinct, corrigé séparément sans modifier ce geste.

Voir [la recette et le contexte d’échec](ux-combined-fc8a687e-2026-10-21/README.md). Cette surface reste non certifiée ; aucune validation production.
