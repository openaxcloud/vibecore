---
id: BUG-SECRETS-MENU-ESCAPE-FOCUS-20261029
---

# Escape ferme Secrets sans rendre le focus

## Bug reproduit

Aux trois formats390/820/1280, Escape ferme le menu Secrets mais le focus retombe sur BODY.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☑ Correctif validé localement, non livré | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Correctif local : rendre le focus à l’ancre connectée uniquement lorsque le focus est encore dans le menu ou sur son ancre. Ne pas voler le focus extérieur après Tab, interaction pointeur ou fermeture indépendante. La recette compilée native finale reste à exécuter.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `env-secrets/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.

## Mise à jour de validation locale

Validation compilée : trois passages390/820/1280 avec ouverture clavier, Escape, fermeture et focus rendu ; zéro reprise. Clé courte volontaire pour isoler le focus du défaut tooltip. Le cas focus déjà extérieur est validé par tests de composants (20/20 suites finales), pas encore par ce parcours natif. Aucun verdict global du lot ni livraison revendiqué.

## Verdict local final

Le build final passe aussi final-secrets-focus3/3 à390/820/1280, sans reprise. Le test natif porte sur retour au déclencheur ; absence de vol de focus déjà extérieur couverte par les tests de composants. Aucun secret réel utilisé.
