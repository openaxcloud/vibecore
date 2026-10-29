---
id: BUG-IDE-TOOLTIP-DOUBLE-RENDER-20261029
---

# Deux infobulles pour une même clé longue

## Bug reproduit

Au focus Secrets desktop1280, le renderer role=tooltip et le pseudo-élément CSS affichent simultanément la même clé synthétique ; largeur588px et scrollWidth2298px.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☑ Correctif validé localement, non livré | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Correctif local : marqueur de propriété du renderer avec cycle de vie/StrictMode et dernier propriétaire ; secours CSS seulement en son absence, mots longs repliables. Escape/scroll ne doivent pas faire réapparaître le secours. Aucun libellé supprimé. Contre-preuve DOM3formats, validation compilée encore attendue.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `tooltip/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.

## Mise à jour de validation locale

État compilé actuel : trois échecs390/820/1280 et un diagnostic instrumenté1280 sont conservés. Le correctif Escape complémentaire vient d’être préparé ; validation compilée finale encore en attente. Ne pas assimiler la contre-preuve DOM ou les tests unitaires à un résultat compilé entièrement vert.

## Verdict local final

Build final : compiled-final3/3 à390/820/1280, texte intégral, une bulle, pseudo:none, Escape/scroll sans résurgence et focus conservé. Les trois rouges initiaux et le diagnostic instrumenté restent archivés. Tooltip26/26 tests avec vrai clavier global ; revue indépendante14/14. Validation locale ciblée, aucune recette production.
