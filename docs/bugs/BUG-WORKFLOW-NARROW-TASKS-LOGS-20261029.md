---
id: BUG-WORKFLOW-NARROW-TASKS-LOGS-20261029
---

## Bug

Les tâches Workflows débordent sur mobile/tablette ; un historique long force la largeur du panneau desktop. Reproduit sur390/820/1280 avec données synthétiques.

## 📤 Dispatché

☑ Diagnostic local29octobre, quatre déclarations CSS ciblées proposées.

## 💻 Codé

☐ main — correctif local séparé de840 : tâches flex repliables, largeur minimale des tracks/historiques contenue. Texte, commandes et actions conservés.

## ✅ Testé live

☐ production — contrepreuveCSS stricte3/3verte, égalité intégrale du log/commande et défilement horizontal effectif ; validation compilée sans injectionCSS390/820/1280 également3/3verte. Buildclient/SSR,70gardesCSS,16tests inventaire et revue indépendante passent. Aucune exécution, installation ni sauvegarde.

## Limites

Pas de validation clavier de réordonnancement ; poignée préexistante non focalisable, aucun verdict global d'accessibilité. Pas Safari, zoom200%, clavier virtuel, backend réel. Preuves ui-workflows-followup-evidence-20261029.
