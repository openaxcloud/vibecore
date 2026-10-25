# Source CNPG et recette physique indépendante

Complément local au consommateur de #782, base main 941d7d7f. Pas d’activation cloud, de nouvelle permission, ni de donnée utilisateur.

## Préparation de l’adaptateur

`inspectCnpgRestoreSource` lit uniquement le Cluster et le Backup précis via le port existant. Il contrôle namespace, types, identifiants, projet/organisation, rattachement, état completed, identité et dates de sauvegarde. Les noms de cluster et de Backup tronqués/non canoniques sont refusés avant lecture, même si un label correspond : le label mutable ne prouve pas la création de la sauvegarde. Cela exclut aussi certains identifiants réels longs ; une identité de création durable et une compatibilité des noms restent à implémenter avant branchement. Le Backup porte désormais le snapshot-id complet : deux identifiants donnant le même nom Kubernetes tronqué ne sont plus confondus par le préflight. Les anciens objets sans ce label restent non admissibles à ce préflight ; leur statut historique n’est pas modifié.

Une référence propriétaire Cluster incohérente est refusée. En son absence, `clusterGenerationLinked:false` signale que le nom réutilisable ne prouve pas la génération de source. Les UID observés sont conservés pour la vérification ultérieure. `archiveVerified:false` et `walContinuityVerified:false` sont toujours explicites : aucune preuve physique n’est fabriquée à partir des métadonnées. Cette primitive pour clusters dédiés n’est pas encore branchée sur une allocation de cible.

Tests : **49/49 contrôlés**, dont 15 de préflight et 34 du provisionneur existant. Aucune requête CNPG réelle n’est revendiquée.

## Recette physique réellement exécutée

L’image historique épinglée `9b05…` est un ID local dont le dépôt ne conserve pas de référence registry récupérable. Aucun téléchargement/substitution de ce banc n’est effectué. La recette distincte `scripts/qa/database-restore-existing-postgres.sh` utilise explicitement les binaires PostgreSQL 16 du conteneur synthétique existant (provenance dans le reçu joint).

Elle crée deux clusters temporaires sous un répertoire unique détenu par postgres, avec sockets Unix privés et `listen_addresses=''`. Aucun nouveau conteneur/volume, aucun accès persistant et aucune modification du PGDATA du service existant. Elle vérifie pg_basebackup, pg_verifybackup, le rejet d’une altération, la restauration au point temporel via les WAL, l’exclusion d’une écriture postérieure, l’identité système, la promotion achevée puis la persistance après redémarrage. Nettoyage limité au répertoire détenu ; absence de résidu vérifiée.

Deux premiers passages ont atteint les données attendues mais sont restés rouges sur l’assertion de promotion : pg_ctl peut signaler prêt pendant la récupération. L’attente finale observe pg_is_in_recovery dans une boucle bornée ; aucun délai fixe ne remplace cette assertion. Le passage final est vert. Les traces rouges restent locales et privées.

Exécution explicitement opt-in, uniquement dans le conteneur synthétique préalablement vérifié :

```sh
docker exec --user postgres -e VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1 -i vibecore-ux-20261021-pg bash < scripts/qa/database-restore-existing-postgres.sh
```

Le garde d’opt-in a été ajouté après la recette ; sa syntaxe et son refus par défaut sont contrôlés séparément. Aucun nouveau passage physique redondant n’est revendiqué pour ce garde.

## Ce qui manque encore

Cette recette prouve une chaîne PostgreSQL locale, pas CNPG/GCS, une restauration applicative de bout en bout, un RPO/RTO commercial ou un fencing distribué. L’adaptateur cloud doit encore vérifier les objets d’archive/WAL avec un lecteur autorisé, attester la cible et son URI, contrôler tous les consommateurs, exclure les anciennes tentatives et gérer les cibles après restauration. Le port Kubernetes actuel get/apply/getSecret ne fournit pas à lui seul une vérification des octets des archives. Aucun accès supplémentaire n’a été demandé ou créé ; une infrastructure CNPG/GCS synthétique autorisée est nécessaire à la recette cloud.
