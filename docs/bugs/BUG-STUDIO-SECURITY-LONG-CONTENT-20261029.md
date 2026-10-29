---
id: BUG-STUDIO-SECURITY-LONG-CONTENT-20261029
---

# Texte long Studio/Security hors du panneau

## Bug reproduit

Les détails consensus Studio débordent390/820/1280. Security déborde à820 car le repli existant ne couvre que les panneaux sous760px.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☑ Correctif validé localement, non livré | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Correctif local limité : grille Studio minmax(0,1fr), min-width0 et wrapping ; wrapping Security hors du seuil étroit. Textes intégraux conservés dans les contre-preuves. Aucun scan, génération IA ou patch approuvé. Recette compilée finale attendue.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `studio-security/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.

## Mise à jour de validation locale

Validation compilée : Studio3/3 et Security3/3 à390/820/1280 sans injection de contre-preuve, textes intégraux et largeur/scroll358/358,771/771,588/588. Les anciens échecs et contre-preuves restent conservés. Aucun scan, Save ou appel IA ; validation de layout uniquement, pas du service réel.

## Verdict local final

Build client/SSR final et typage web final réussis ; les six recettes compilées de repli restent valides pour ce lot local. Aucun scan, Save ou appel IA réel. Les états main et production restent non validés.
