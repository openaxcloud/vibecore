---
id: BUG-DEBUGGER-NARROW-LAYOUT-20261029
---

# Debugger déborde dans un panneau étroit

## Bug reproduit

Le corps Debugger atteint3194/3203/2976px pour390/820/612px disponibles. Conditions et valeurs longues sont coupées ; grilles liées au viewport ignorent la largeur du panneau réel.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☑ Correctif validé localement, non livré | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Correctif local limité à trois classes et CSS Debugger : pistes adaptatives et wrapping, métriques conservées. Contre-preuve DOM3formats avec textes intégraux. Aucun handler, moteur, attach/step/run/stop modifié ni exécuté ; build corrigé encore à recetter.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `preview-debugger/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.

## Mise à jour de validation locale

Trois recettes compiled-debugger390/820/1280 passent leurs mesures du corps. Un débordement résiduel de5px de Remove a ensuite été établi et fait l’objet d’un complément local ; recette finale de ce complément encore en attente. Les trois verts partiels ne clôturent pas le défaut global de layout.

## Verdict local final

Le complément shrink-0 du formulaire Remove passe maintenant la recette stricte remove-compiled3/3 à390/820/1280 : bouton contenu, clic d’essai sans activation, focus, texte des lignes et corps sans débordement. Les reçus remove-red et anciens verts partiels sont conservés. Revue indépendante favorable, aucun moteur ou runtime réel exécuté.
