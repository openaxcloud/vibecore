---
id: BUG-SETTINGS-SIDEBAR-NARROW-PANEL-20261028
---

## Bug

À viewport1280, le panneau Settings ne dispose que de588px. Sa grille principale est déjà réduite à une colonne, mais la navigation latérale reste sticky et recouvre le formulaire Préférences pendant le défilement lié au focus. Le centre du SELECT Thème renvoie un SPAN de cette navigation au hit-test. Les cartes restent réparties en deux colonnes de285,8px. Aucun débordement horizontal du hub : client588/scroll588.

## 📤 Dispatché

☑ 28/10/2026 — correctif local CSS Settings, distinct des brouillons et de Problems.

## 💻 Codé

☐ main — correction locale validée : classe de conteneur Settings appliquée à toutes les sous-pages par leur propriétaire ; ajout du sélecteur de grille Settings à la règle auto-fit existante du module. Aucun style global ni règle Problems modifié.

## ✅ Testé live

☐ production — aucune recette production ni backend réel. Recette compilée finale réussie sur l’assemblage Settings, avec hit-test réel du champ Thème et zoom natif 200 %.

## Cause et contrepreuve locale

La classe du module nommant le conteneur project-settings n’était appliquée qu’à Usage et Memory. Les règles locales de sidebar static sous1000px n’étaient donc pas actives dans Compte/Préférences. Le correctif réutilise ces règles et adapte les cartes selon la largeur disponible avec auto-fit/minmax(min(100%,360px),1fr).

Deux contextes Chromium FR clair,1280 et1920, sur build66352 avec API synthétique et mutations bloquées. Contrepreuve DOM explicitement séparée de la recette compilée : à1280, sidebar sticky→static, cartes285,8→587,7px, hit-test thème SPAN→SELECT ; hub reste588/588. À1920, hub1101px, sidebar280px sticky et cartes394,3px inchangés, SELECT accessible avant/après. Tous les champs/actions restent présents. Aucune soumission.

## Validation et limites

Deux tests existants settings-memory-preview verts, formatage et diff-check verts. Aucune suite miroir CSS ajoutée. Revue indépendante favorable. Les captures ne certifient pas le contraste ; seuls ces deux contextes FR clair ont été mesurés ici. Les états des brouillons appartiennent à un autre correctif et ne sont pas validés par cette contrepreuve. Build et typage global de l’assemblage réussis, 129 tests ciblés verts et six recettes Settings compilées réussies. Les recettes finales incluent FR/EN à1280/1920, resize390, zoom200% et deux panneaux indépendants ; voir les preuves compilées distinctes.

[Reçus, captures et limites](settings-sidebar-width-evidence-20261028/README.md). Les captures before/after de cette archive désignent avant/après injection DOM, pas deux builds produit. App20999 et fixture8699 propres arrêtées après vérification PID/startTicks/argv ; étatsZ sans cmdline, ports refusés. Aucune autre fixture touchée.

Recette finale et nettoyage : [preuves compilées](settings-sidebar-width-evidence-20261028/compiled-final/hit-test-and-zoom.json), [cleanup](settings-sidebar-width-evidence-20261028/compiled-final/cleanup.json). Le dernier lanceur récolte ses enfants : app77239, fixture77238 et lanceur absents, ports fermés.
