---
id: BUG-PREVIEW-STOP-OBSERVERS-20261028
section: "Preview et runtime"
---

# Stop respecté par le serveur, masqué par l'interface et les sondes

## 📤 Dispatché

☑ 28/10 — recette après livraison #825 ; base `cb1cefa892`.

## 💻 Codé

☐ — correction isolée, pas encore intégrée à main.

## ✅ Testé live

☐ — défaut constaté ; correction non livrée et non recettée en production.

## Preuve et périmètre

La recette transmise par la session navigateur rapporte un Stop unique à
14:17:19 UTC, puis une interface « Starting » ou « Stop running » et des erreurs
proxy répétées. À 14:21 le backend indique zéro processus et zéro port, sans
nouveau Vite pendant plus de trois minutes. Le Run explicite à 14:21:45 lance
Vite à 14:21:57 et l'aperçu revient à 14:22:17. Ces faits confirment le garde-fou
serveur de #825 ; ils ne démontrent pas un nouveau redémarrage automatique.
Aucun exit code supplémentaire n'est disponible. Aucun projet client n'est
modifié par la présente session.

## Causes reproduites et correction

- Les contrôles Run/Stop dérivent leur état du workspace (qui reste disponible
  pour éditer les fichiers) sans donner priorité à l'intention Stop. Un ancien
  état `running`/`starting` masque ainsi le Run utilisable.
- Dans Preview, un port périmé sélectionne la branche iframe avant la carte
  d'arrêt. Ses événements load/error et timers peuvent continuer les navigations
  proxy. Stop doit retirer le cadre et invalider ses reprises, pas seulement
  interdire un nouveau processus.
- PreviewsStore garde son observateur et ses reconnexions actifs ;
  refreshRuntimePorts interroge les ports avant son ancienne garde Stop.
  Suspendre l'observation ferme le watcher, annule les reprises différées,
  vide les ports affichés et rejette les anciens callbacks/résultats en vol.
  Run réactive l'observation sans que cette opération lance un processus.
- L'intention mémorisée est restaurée avant le raccordement runtime au
  rechargement. Un changement de projet ne transporte pas l'état d'exécution
  visuel du projet précédent. Une simple reconnexion au même projet conserve
  les erreurs d'arrêt et l'intention.

L'état stopping reste occupé et un kill échoué reste une erreur visible,
jamais une confirmation d'arrêt inventée. L'état du workspace n'est pas falsifié :
son démarrage pour les fichiers/terminaux reste indépendant du serveur preview.
La sonde ponctuelle d'adoption du Provider n'est pas transformée en démarrage de
preview ; les boucles de surveillance et navigation sont suspendues par Stop.

## Validation isolée

Contre-épreuves rouges : iframe périmée après Stop ; état compact idle plus
workspace running ; trois tests de raccordement des observateurs et un retour
A arrêté → B actif → A ; cinq tests de suspension/reconnexion du magasin de
ports. Les tests de composant utilisent réellement Preview et des stores
synthétiques ; ils vérifient dix secondes sans reprise automatique ni iframe,
Stop en cours, erreur de kill et rechargement avec workspace starting.
Les tests d'observateur couvrent connexion tardive, poll tardif après Stop/Run,
ancien événement, changement de runtime arrêté et timer de rafraîchissement.
Le test de #825 utilisant un vrai enfant HTTP local est conservé.

Il ne s'agit pas d'une recette distante ni d'un nouveau test sur le projet
utilisateur. Validation assemblée locale : 311 tests dans 35 fichiers, typage officiel complet,
build client/SSR et garde d'inventaire réussis. Lint : zéro erreur, 52 avertissements
préexistants. Catalogues et garde source i18n réussis. Revue indépendante favorable
avec 41 tests rejoués. Ces décomptes se recouvrent et ne s'additionnent pas.

## Limites et coordination

L'intention reste par projet et par session d'onglet, pas un verrou global entre
collaborateurs. Les terminaux indépendants restent utilisables. Aucun changement
aux permissions, commandes ordinaires bornées, lease preview-service, politique
idle, secrets ou infrastructure. Ne pas annuler les livraisons #824/#826 ;
intégrer leur main si nécessaire et revalider les conflits sémantiquement.
