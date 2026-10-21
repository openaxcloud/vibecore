# Configuration des tâches planifiées — preuve serveur PostgreSQL

Base exacte : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`. Lot indépendant de #748 ; mêmes fichier app.ts mais blocs de routes distincts. Aucun changement des workflows CI, de l'exécution des commandes, du moteur de restauration ou de la sécurité.

Défauts reproduits : PATCH acceptait une commande vide (200 au lieu de 400), puis acceptait un fuseau inexistant (200 au lieu de 400). Le schéma partagé création/modification vérifie désormais le fuseau avec Intl, et PATCH vérifie la commande effective d'une tâche DEPLOYMENT avant toute écriture. projects:write reste requis. Les tâches WORKFLOW ne reçoivent pas cette contrainte de commande.

## Recette réelle

Application Fastify écoutant sur une socket locale, sessions persistées, PrismaApiStore et dépôt PostgreSQL réels. Base locale jetable `panel_proof`, pgvector/pg16 ; migrations du dépôt appliquées. Deux utilisateurs et organisations synthétiques ; nettoyage limité aux identifiants créés par le test. NODE_ENV=test : ordonnanceur désactivé, aucune commande exécutée. Aucun lancement ScheduledTaskRun créé.

| Scénario | Attendu et observé après correction |
|---|---|
| Création | Commande vide refusée deux fois 400 ; création désactivée 201 ; champs et nextRunAt=null relus après nouvelle application/connexion. |
| Modification invalide | Deux PATCH nom+commande vide refusés 400/SCHEDULED_TASK_NO_COMMAND ; objet entier inchangé après reconnexion. |
| Modification et isolation | Deux modifications réussies ; GET/POST/PATCH/DELETE autre organisation refusés 404 ; cron et fuseau invalides refusés 400 ; objet entier inchangé après reconnexion et champs valides persistés. |
| Activation | Activation persistée, nextRunAt futur préservé après deux renommages et reconnexion ; désactivation persistée avec nextRunAt=null ; zéro lancement. |
| Suppression | DELETE 204, reconnexion, répétition 404/SCHEDULED_TASK_NOT_FOUND ; liste et tables de tâches/lancements vides pour ce projet. |

`before.json` détaille les cinq tests sur le code de base : 3 réussis, 2 échecs attendus, zéro saut. Le test était non commité ; empreinte exacte incluse. `after-sources.json` détaille les 57 tests, durées, statuts, code sortie et empreintes des sources : 5 PostgreSQL et 52 régressions existantes du planificateur/cron. Ces 52 tests ne constituent pas une preuve de fournisseurs ou d'exécution de tâches en production. Le rapport avant commit marque honnêtement dirty=true. Les fichiers .sha256 vérifient l'intégrité, sans prétendre être une signature cryptographique d'identité. La PR fournit aussi le reçu et le rapport détaillé de la tête finale propre.

Exécution exigée, avec refus de tout saut ou compte PostgreSQL différent de sept :

```sh
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/panel_proof \
  sh services/api/scripts/verify-scheduled-task-postgres.sh /tmp/schedule-proof
```

Le script produit tests.json, tests.log, tests-summary.json et receipt.json. La CI générale sans activation explicite saute ces sept cas : sa couleur ne prouve pas leur exécution. Le workflow dédié `.github/workflows/scheduled-task-postgres.yml` active le banc sur la tête exacte de la PR, exige sept cas PostgreSQL et zéro saut, et publie son rapport détaillé et le reçu dans un artefact. Aucun contrôle existant affaibli.

## Autres contrôles et limites

Typecheck et build API réussis. Lint du nouveau test : 0 erreur/avertissement. Lint global exact `eslint --cache --cache-location ./node_modules/.cache/eslint app` : sortie 0, 51 avertissements. Lint ciblé app.ts : sortie 1, 366 erreurs/13 avertissements sur base ET candidat ; comparaison du multiensemble règle/message/sévérité identique, lignes exceptées. Aucun diagnostic nouveau dans le bloc modifié. Formatage global app.ts déjà divergent hors bloc ; fichier non reformatté globalement. Scanner anti-simulation réussi. Hooks Git : core.hooksPath non défini, uniquement exemples dans .git/hooks ; aucun hook exécuté ou désactivé, aucun contournement pour commiter.

Cette preuve ne couvre ni concurrence des modifications/transferts/révocations, ni moteur d'exécution, fournisseurs, facturation, authentification par formulaire, UI/BFF ou production. Elle ne certifie aucun panneau entier. Recette combinée avec #748 et autres lots requise avant intégration ; aucune fusion autonome.


## Récupération des tâches héritées à commande vide

La revue de #751 a identifié une incompatibilité de la première garde PATCH. Reproduction sur `b07d9158dff65059012a074210ea45e2134d416f` : cinq cas initiaux réussis, deux nouveaux cas échoués avec 400 au lieu de 200. Des tâches réelles sont créées puis leurs colonnes sont remises dans l'état historique invalide par Prisma ; elles sont relues après reconnexion avant l'action HTTP.

La commande vide existante est tolérée uniquement si l'état final reste désactivé et si le client ne soumet pas explicitement le champ command. Ainsi, désactiver une tâche active héritée fonctionne deux fois et efface nextRunAt ; renommer une tâche héritée désactivée fonctionne deux fois et ne la réarme pas. Renommer sans désactiver une tâche active invalide reste refusé. Soumettre explicitement une commande vide, même avec enabled=false, ou réactiver sans réparer la commande reste refusé. Réparer la commande et activer dans le même PATCH fonctionne. Les contrôles projects:write sont inchangés ; une autre organisation ne peut pas effectuer la récupération. Le moteur existant refuse déjà une commande vide avant exec ; ni ce moteur ni la route d'exécution manuelle ne sont modifiés ou certifiés ici.

`recovery-before.json` publie les deux échecs, noms/durées/statuts/code sortie et sources exactes. La recette finale compte **7 PostgreSQL + 52 régressions = 59 tests**, avec zéro skipped/todo. `after-sources.json` et les paragraphes initiaux restent le reçu historique des 57 tests avant cette revue ; le rapport final du nouveau SHA propre est publié dans la PR et le workflow produit son propre artefact.

`recovery-skipped-counterproof.json` contient la contre-épreuve réelle : sans activation explicite, Vitest termine avec 52 réussis et 7 sautés, code 0 ; le vérificateur du workflow refuse ce rapport, code 1. Aucun résultat de test n’a été fabriqué.
