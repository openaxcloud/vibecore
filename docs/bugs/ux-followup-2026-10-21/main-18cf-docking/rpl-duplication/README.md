# Duplication d’onglets au focus et après déplacement — 22 octobre 2026

## Signal et portée

La CI de la tête `d83cb4a18` a été rapportée par la coordination avec **445 succès, 26 skips explicites et 2 échecs finaux** : `rpl-ide-panels-proof.spec.ts`, thèmes clair et sombre. Dans les trois tentatives de chaque cas, le déplacement augmente le total de trois à cinq onglets. Ce dossier conserve les reproductions locales ; il ne remplace pas le rapport CI et ne certifie aucun comportement en production.

Les reproductions utilisent Chromium à 1280 × 720, des projets synthétiques et le build local. La première reprend le produit compilé `4ec690fc` correspondant au contenu produit de `d83cb4a18`. Les scripts locaux modifient seulement la destination des captures et ajoutent un reçu des tableaux de panneaux ; le deuxième passage renforce l’assertion avant déplacement. Aucun seuil ni délai d’assertion n’est assoupli.

## Trois étapes rouges distinctes

| Reçu | Résultat local | Observation |
| --- | --- | --- |
| `original-move-red.json` | 0 succès, 2 échecs, zéro retry/skip | `[[editor,preview],[deployments]]` devient `[[editor,preview,deployments],[deployments,deployments]]` après le geste complet. |
| `focus-only-red.json` | 0 succès, 2 échecs, zéro retry/skip | L’ouverture du menu du premier panneau ajoute déjà `deployments`, avant tout déplacement. |
| `stable-callback-still-red.json` | 0 succès, 2 échecs, zéro retry/skip | Le premier correctif stabilise le callback : l’assertion de focus passe. Le déplacement reste rouge, de trois à quatre onglets, car son écho URL réouvre `preview` dans le panneau source. |

Le nom historique du dernier répertoire local, `rpl-green`, est trompeur : **cet essai est rouge**. Les reçus publient son verdict réel. Chaque reçu contient les cas, durées, erreurs d’assertion, tableaux disponibles et l’empreinte du rapport local brut conservé hors du dépôt.

## Cause et correctif en validation

`openWorkspacePanel` dépendait de `activePaneId`. Le focus changeait ce callback, ce qui rejouait l’effet de synchronisation du panneau URL et ouvrait un outil sans nouvelle demande de navigation. La lecture du panneau courant par ref stabilise le callback et corrige cette première injection.

Le déplacement change aussi le panneau indiqué dans l’URL. Après restauration du focus dans le panneau source, l’effet URL pouvait ouvrir une nouvelle copie de l’onglet déplacé. Le correctif final ajoute un reçu ponctuel de déplacement : projet, workspace, fenêtre, panneau, identifiant d’onglet et destination. L’effet consomme le reçu ; il ne neutralise l’écho que sur desktop, dans le même scope, et si l’onglet existe effectivement dans la destination. Les autres demandes et la navigation mobile suivent le chemin normal. Ce reçu ne remplace pas les vérifications navigateur.

La relecture statique du diff final confirme ces gardes. Le build intermédiaire dont les sources ont été modifiées pendant compilation est exclu de la preuve finale.

## Validation locale ciblée finale

Le passage du 22 octobre à 07:01:59 UTC termine en **26,49 s : 2/2 succès directs, zéro retry, skip ou échec**, thèmes clair et sombre. `final-local-green.json` conserve les verdicts et durées, l’empreinte du rapport local, celle du manifeste `final-rpl/sources.json` et celles des deux sources revues. La chaîne complète vers le build final reste dans le dossier de provenance géré par le chantier principal.

Les assertions confirment l’absence d’ajout au focus, la conservation du nombre et des identifiants d’onglets, puis leur redistribution effective. Deux gestes supplémentaires passent : ouvrir Terminal dans le panneau récemment ciblé et naviguer vers `?panel=git`, qui sélectionne exactement un onglet Git. Aucun résultat ne prouve l’exécution d’une commande terminal ni le chargement complet des données Git ; les captures Git montrent encore le chargement. Cette recette ne certifie pas la persistance du layout après rechargement.

La recette combinée de 66 cas est encore en cours au moment de cet ajout. Ces deux succès locaux ne constituent ni un résultat CI de la nouvelle tête ni une validation production.

## Captures et confidentialité

Les quatre captures préfixées `original-` et `stable-callback-` montrent l’état avant/après le geste dans des **essais échoués**. Les quatre captures préfixées `final-` proviennent du passage local final réussi. `captures.json` donne leur chemin source relatif, leur empreinte SHA-256 et leur interprétation. Le couple clair documente le défaut initial ; le couple sombre documente le défaut restant après stabilisation du callback. Les captures ont été inspectées : noms et contenu de projets synthétiques, aucune donnée utilisateur réelle ni secret visible.

Les rapports publiés sont une extraction sur liste blanche : titres, verdicts, durées, messages d’assertion et tableaux d’onglets. Configurations d’environnement, sessions, cookies, corps/en-têtes réseau et rapports bruts ne sont pas copiés. Aucun résultat n’est omis dans ces trois exécutions locales ; leurs deux échecs chacune restent explicites.
