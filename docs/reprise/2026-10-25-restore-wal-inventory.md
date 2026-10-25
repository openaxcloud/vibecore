# Restauration : inventaire WAL local et raccordement des consommateurs

## Portée et provenance

Suite locale des commits `6a70bcce40dc681d56e31568c521a30abba4cb60` et `46ec1af332188e4e79558132d8176cb2bbccc18d`, conservés sur `feat/restore-archive-verification`. Main lu avant travail : `d09045d5a2fca53dbd7dbab61b4e505ad251d728`. La comparaison GitHub depuis `b9a36623` ne modifie aucun module `database-restore-*` ; les changements UI/API concurrents ne sont pas intégrés ou publiés par ce lot local. Ce n'est pas une attestation de l'arbre main complet. Aucun index partagé modifié ; intégration et publication à coordonner avant tout nouveau lot distant.

## Défaut reproduit et correctif

Le vérificateur local de backup acceptait `Timeline: 4294967296`, alors que le planificateur WAL exige une timeline PostgreSQL uint32. Contre-épreuve avant correction : 1 échec / 8 succès. La validation du manifeste refuse désormais cette valeur avant toute invocation d'outil PostgreSQL.

`verifyWalObjectInventory` compose le calcul d'un intervalle LSN semi-ouvert sur une timeline avec un inventaire d'objets immuables : couverture exacte, pas de segment manquant/supplémentaire/dupliqué, pas de même clé utilisée pour deux segments, générations sûres, taille bornée et SHA-256 des octets lus. L'inventaire est copié avant le premier await. Toutes les métadonnées sont contrôlées avant lecture ; une erreur en cours ne retourne aucun reçu partiel et ne divulgue pas le diagnostic du fournisseur.

L'association segment → objet doit venir d'un inventaire de confiance et le lecteur doit être lié au projet/serveur de l'opération. Cette fonction ne transforme pas une liste de bucket en preuve d'origine. Elle conserve explicitement `walRecordsVerified: false` et `targetReached: false` : hash d'objet comprimé, validité des enregistrements WAL et rejeu jusqu'à la cible sont trois preuves différentes. Aucun raccordement au coordinateur de production.

## Validation de cet incrément

Premier passage le 25 octobre à 21:51 UTC : 44/44. La revue indépendante a ensuite reproduit une substitution du segment dans le reçu par un champ JSON additionnel `object.segment`. Contre-épreuve dédiée avant correction : 1 échec / 14 succès. Le snapshot copie maintenant uniquement key/generation/size/sha256 ; aucun champ additionnel ne peut remplacer le segment ou être divulgué dans le reçu.

Passage final : **45/45 tests ciblés, zéro omission** sur quatre fichiers (archive9, lecteur14, plan WAL7, inventaire15). Les quinze nouveaux cas utilisent des octets synthétiques et de vrais fichiers temporaires isolés ; les fautes de lecture/corruption sont injectées. Aucun objet cloud, vrai WAL PostgreSQL ou cible physique n'est créé par ces tests. La recette physique locale historique reste uniquement celle documentée dans `2026-10-25-restore-archive-verification.md` ; elle n'est pas rejouée ni présentée comme restauration cloud.

## Inventaire des consommateurs et plus petit raccordement sûr

Les consommateurs effectivement lus dans le code restent :

- `inspectPostgresSchema` et `runDatabaseQuery` dans `services/api/src/app.ts` : clients directs, sans admission liée au journal de restauration.
- Le serveur généré du même fichier : pool autonome `pg.Pool`, max3, connecté via DATABASE_URL.
- `startServerDeployment` et les runtimes workspace dans `services/workspace-manager/src/manager.ts` : environnement/Secret injecté au démarrage ; modifier le Secret ne prouve ni arrêt des transactions ni reconnexion.
- `PostgresRestoreConsumer` : seul consommateur coopérant local déjà testé, ne représentant pas les clients précédents.

Le dépôt dispose déjà d'une admission transactionnelle dans `PrismaDatabaseRestoreRepository.admit`, verrouillant le scope puis `activeLock`. Le prochain lot recommandé est un registre durable des consommateurs gérés (instance/projet/environnement, bindingVersion, UID de processus/workload et génération), avec admission sous le même verrou que la restauration. Le début de restauration gèle l'inventaire ; aucune nouvelle admission n'est acceptée. Chaque accusé de drainage doit correspondre à l'UID/génération et tentative attendus. Expiration de bail, disparition d'un heartbeat ou changement du Secret ne valent jamais arrêt confirmé. Un participant inconnu/incontrôlable doit maintenir le refus de capacité.

Ce raccordement touche le schéma/repository, les deux admissions API, le serveur généré et le workspace-manager : il dépasse ce lot WAL et doit être coordonné avant édition de ces chemins partagés. Il peut commencer par une migration additive et des tests PostgreSQL synthétiques, sans nouveau service ni permission. La preuve des workloads nécessite ensuite les primitives autorisées de lecture/arrêt et leur identité réelle ; aucun arrêt réel n'a été essayé ici. Les connexions directes non gérées restent un blocage distinct, pas une entrée d'inventaire qu'on peut supposer absente.

## Prérequis toujours non satisfaits

Inventaire cloud fiable liant backup/segments/générations/empreintes ; extraction immuable des archives ; validation WAL/history et preuve de rejeu PostgreSQL à la cible ; exclusion des anciennes tentatives et drainage de tous les consommateurs. L'image historique absente n'est pas téléchargée ou substituée. Aucune ressource, clé, permission ou opération cloud réelle n'a été créée. La restauration cloud reste refusée tant que ces garanties manquent.
