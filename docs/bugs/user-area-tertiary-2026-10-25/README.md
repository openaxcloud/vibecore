# Complément UI : organisation et liens profonds légaux

Lot consolidé préparé pour une PR distincte ; base produit #795, fusionnée normalement sur main5b09bf65b après livraison#792. La livraison#795 reste suivie séparément. Aucun état « codé sur main » ni « testé live production » attribué à ce complément.

| Périmètre | Avant | Après correctif compilé | Limites |
| --- | --- | --- | --- |
| Rôles, permissions, invitations, audit |80 observations, quatre routes avec noms longs coupés ; quatre contrepreuves DOM séparées |80 observations et7parcours, 64cas corrigés et16audit contenus |320/390/768/1440, FR/EN thèmes ; données/API synthétiques, aucun rôle/invitation/accès créé |
| Contact et Contact Sales |32observations et8parcours+4Retour sans défaut confirmé |Pas de correction nécessaire dans ce périmètre |Pas d'envoi réel, zoom ou contraste calculé |
| Privacy, Terms, Support-policy |48géométries et12parcours ; défaut liens profonds confirmé Privacy/Terms |Privacy/Terms32cas SSR/ancres/Retour et4zooms200% réussis |CTA Support-policy validée ensuite sur9799 ; autres fragments non validés. /legal couverte ensuite par le complément marketing, autres pages non couvertes |

Dix fichiers produit locaux : quatre routes organisation (wrapping et cible44px), quatre fichiers Privacy/Terms (SSR et marges), une route Support-policy et un composant Features. Aucun routage commun, moteur, workflow ou composant métier Intégrations modifié. Fichiers comparés aux31PR ouvertes, aucun chevauchement. 33tests organisation +16tests catalogue légal +14tests Support/Features verts, lint ciblé11fichiers zéro erreur, typage web strict et build consolidé verts, revues indépendantes favorables. Les matrices sont liées à leurs builds respectifs ; géométrie organisation vérifiée sur9499 ; la hauteur du label roles-and-permissions a ensuite changé et ses cibles ont été vérifiées sur9899.

Les corrections ont été préparées localement pendant la CI/livraison #792 et #795. Publication en PR distincte après intégration de main5b09bf65b, sans fusion avant livraison#795. Aucun achat, secret, accès externe ou mutation cliente réelle. Les anciennes opérations refusées ne sont pas retentées.

Clavier virtuel OS, safe areas physiques, Safari/Firefox complets, backend réel et production authentifiée restent non validés. Pas de certification globale de plateforme.

Complément marketing : /legal et /features32observations et8parcours sans débordement non contenu. Support-policy16reproductions de l’ancreCTA ; filtresFeatures4groupes fonctionnels sans étatARIA initial. Correctifslocaux appliqués aprèsrevue. Les autresancresSupport-policy restent horscorrection. Les recettes compilées finales figurent dans les sous-dossiers après9799/9899.

Recettes finales réussies : Support CTA16cas etFeatures4groupes/24activationsclavier sur9799 ; labels228activations/restaurations sur9899, minimum44px. Zéro erreurJavaScript/hydratation ni mutation dans ces parcours. Les anciens serveurs9499/9699 sont périmés après reconstruction ; leurs preuves datées restent distinctes. Journaux archivés normalisés uniquement pour espaces finaux, ANSI et extension.txt.

Les propositions .patch archivées sont des diagnostics, avec espaces de fin de ligne normalisés pour le contrôle Git ; les empreintes des sources produit finales (validation/source-sha256.json) font foi pour le code livré localement.

Suivi livraison : le snapshot delivery-pending.json conserve le retard de clôture GitHub observé après les sept jobs E2E réussis. Le contrôle de livraison a ensuite passé à23:29UTC et le préflight a démarré ; ce retard est résolu, le rollout reste distinct/non confirmé dans ce snapshot.

## Consolidation après #795

Le lot inclut désormais aussi le [hero Agent IA](../ai-agent-hero-2026-10-25/after10099/README.md), soit11fichiers produit et1adaptation de mock de test. Les arbres Git a12623f6d et154770244 sont identiques après intégration de main5b09bf65b ; les huit fichiers produit de#795 sont conservés exactement. Revue indépendante favorable,12empreintes sources vérifiées.67tests ciblés uniques (33organisation+16Privacy/Terms+14Support/Features+4Agent), plus6tests gardeindex499. Le build final Agent inclut tous les changements, typage strictvert et recettes liées à leurs sources. Gitleakscomplet8.21.2 vert sans modification deconfiguration. Les résultats du lintglobal final sont archivés dans validation/consolidated-lint.txt.

#792 livrée sur ef65c1e68, workflow40242629544 entièrement réussi avec vérificationrollout/imageIDs. #795 fusionnée sur5b09bf65b :31contrôlesPRréussis,2skipsprévus,507testsE2E sanséchec/waiver/retry ; CI main/déploiement distincts, pas encore revendiquéslivrés dans cetinstantané. Aucun point ne passe « testé live production ».
