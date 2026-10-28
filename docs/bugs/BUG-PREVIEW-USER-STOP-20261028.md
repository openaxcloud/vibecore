---
id: BUG-PREVIEW-USER-STOP-20261028
section: "Preview et runtime"
---

# Stop utilisateur suivi d'une relance automatique

## 📤 Dispatché

☑ 28/10 — diagnostic sur main `58fa0702a` ; distinct du timeout de #822.

## 💻 Codé

☑ — #825 fusionnée dans main `cb1cefa892`, livrée le 28/10 à 14:13:12 UTC.

## ✅ Testé live

☐ — recette partielle : le garde-fou serveur fonctionne, mais interface et sondes restent incorrectes après Stop ; voir BUG-PREVIEW-STOP-OBSERVERS-20261028.

## Preuve et mécanisme

Une unique action Stop est suivie d'un SIGTERM à 10:46:27 UTC, puis d'une
relance automatique de Vite à 10:46:35 sans Run manuel. L'aperçu revient
ensuite. Ce cas est distinct des SIGTERM initiaux du portfolio non attribués.

Le store termine Stop avec un état `idle` et n'enregistre aucune intention
utilisateur durable. Les boucles de démarrage/reprise et les callbacks de
préparation déjà engagés peuvent alors relancer le serveur. Le correctif doit
bloquer les relances automatiques après Stop, invalider les démarrages antérieurs,
et laisser un Run explicite réactiver le projet sans masquer les échecs d'arrêt.

## Correctif préparé

L'intention Stop est enregistrée avant toute attente, par projet, dans le
store et `sessionStorage`. Elle survit au remontage, au rechargement du même
onglet et à A → B → A ; un nettoyage transitoire `configureProject(undefined)`
ne l'efface pas. Seuls les gestes Run/restart/reinstall explicitement marqués
`intent: user` retirent le verrou. Les appels automatiques, même munis de
`forceRestart` ou issus d'un artefact, ne le retirent pas.

Une époque invalide les préparations et résultats des lancements antérieurs :
Stop pendant détection, installation ou délai de retry empêche le prochain
lancement. Les anciens flux ne peuvent plus réécrire l'état d'un nouveau Run.
Run attend un Stop en cours sur le même projet pour préserver les kills ; une
attente du projet A ne bloque pas le projet B. Un échec de lecture des processus
ou de kill reste une erreur, jamais un arrêt confirmé fictif.

La preview désactive ses boucles de démarrage et affiche la carte d'arrêt
existante. Les boutons, raccourcis et commandes Run explicites transmettent
l'intention utilisateur ; le bouton de la route IDE démarre désormais vraiment
au lieu de seulement ouvrir le panneau.

## Validation et limites

Huit tests rouges initiaux, puis une course inter-projets rouge supplémentaire,
ont été reproduits. Quatorze tests passent après correction, dont un vrai
processus HTTP local : arrêt effectif, aucune création de processus après trois
cycles automatiques, puis nouveau PID et HTTP 200 après Run explicite. Fichiers,
probes et adaptation runtime restent des fixtures : ce n'est pas un E2E distant.
Les processus de test sont nettoyés en `finally`.

Les tests couvrent aussi la restauration depuis sessionStorage dans une nouvelle
instance, le retry interrompu, l'installation en attente, le résultat tardif,
le refus de kill et la sérialisation Stop/Run. Revue indépendante favorable après
correction de l'attente inter-projets. Les 286 tests ciblés workbench/preview/
artefacts passent ; ce décompte inclut les treize premiers tests du store, le
quatorzième ayant été ajouté ensuite et exécuté dans la suite complète de 14.

L'intention est locale à la session du navigateur : elle ne prétend pas imposer
un verrou serveur à d'autres onglets, appareils ou collaborateurs. Un terminal
utilisateur reste capable d'exécuter ses propres commandes. Aucun endpoint,
permission, secret ni paramètre runtime global modifié. Aucun projet client
édité ni redémarré. Le helper de reprovisionnement du workspace conserve cette
intention au rechargement ; Run explicite reste disponible pour réactiver.

## Coordination

Lot distinct de #822. Lors de l'intégration, conserver à la fois le marqueur
`lifecycle: preview-service` de #822 et les gardes d'époque/intention de ce lot
dans le lancement dev et `#streamWorkspaceCommand`. Les seuls changements
BaseChat concernent les arguments de trois gestes Run (mobile, raccourci,
palette), pas la logique de la palette. Le compteur d'inventaire doit être
régénéré avec les fiches des deux lots, sans écraser celle de #822.

La preuve avec processus HTTP a aussi été exécutée sur un checkout détaché de
l'ancien main `58fa0702a` : échec, huit créations de processus au lieu de la seule
création initiale après les cycles automatiques. Elle passe sur le correctif.
Les enfants sont nettoyés même dans la contre-épreuve rouge.

Typage officiel complet, revalidation web finale, build web/SSR, catalogues
FR/EN et garde i18n réussis. Lint web : zéro erreur, 52 avertissements
préexistants. Aucun résultat production du correctif n'est revendiqué.

## Recette après livraison

La session navigateur rapporte zéro processus et zéro port pendant plus de trois
minutes après le Stop de 14:17:19 UTC, puis un nouveau Vite seulement après Run
explicite à 14:21:45. Le correctif serveur est donc confirmé sur ce parcours.
Le statut visuel et les sondes restaient erronés ; le parcours complet ne reçoit
pas de validation live. Voir [le défaut résiduel](BUG-PREVIEW-STOP-OBSERVERS-20261028.md).
