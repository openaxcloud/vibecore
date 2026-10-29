---
id: BUG-GIT-LONG-BRANCH-GRID-20261029
---

# Branche Git longue dilate les grilles desktop

## Bug reproduit

À1280, branche synthétique189caractères et chemin long : panneau588px, scrollWidth1987, Workingtree décalé/coupé. Deux reproductions ; mobile/tablette passent.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☐ Réservé, non appliqué | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Incident ouvert et réservé au propriétaire Git/IDE. Aucun correctif source appliqué dans ce lot. Contre-preuve DOM : contraindre les deux grilles à minmax(0,1fr), min-width0 ; à confirmer par propriétaire avec actions/diff et formats. Aucun commit/push/pull/OAuth réel.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `reserved-readonly/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.
