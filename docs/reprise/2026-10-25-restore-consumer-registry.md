# Registre durable de consommateurs — lot local non activé

## Base et fichiers partagés

Branche `local/restore-consumer-registry`, à partir de `80c375450a5ae0f604fbcf131a3c9c708e981bce`, conservé sans amendement. Main vérifié avant édition : `d09045d5a2fca53dbd7dbab61b4e505ad251d728`. L'arbre local n'est pas présenté comme le main complet ; intégration exacte requise avant PR. Les commits locaux d'archives/lecteur restent préservés.

Le seul code existant modifié est `database-restore-repository.ts` : extraction à l'identique du verrou d'admission Project puis DatabaseInstance, avec SKIP LOCKED et refus busy distinct. Le registre utilise le même verrou. Ajout du modèle Prisma, de la migration additive 0093 et de trois modules : verrou partagé, registre, host/drainage. Aucun index commun, UI, hub Intégrations, workflow, `app.ts` ou workspace-manager modifié.

## Comportement implémenté

Le registre persiste instance, bindingVersion, type de consommateur, UID immuable, génération, bail observé et état de drainage. L'admission vérifie projet/organisation/environnement/binding, sous le verrou partagé ; une restauration active refuse tout nouveau participant. Un UID ne peut pas être réutilisé, même après drainage.

Le gel exige le propriétaire du journal en phase QUIESCING, sans dette de fencing. Il inclut les baux expirés et les anciens bindings non drainés. Seul un acquittement correspondant à l'instance, UID, génération, binding, opération et tentative peut marquer DRAINED. L'expiration d'un bail, le redémarrage de l'objet registre ou le silence d'un processus ne font jamais cette transition. La preuve exposée est limitée à `registeredConsumersDrained`; `globalQuiescenceProven` reste toujours false.

`RegisteredApiConsumerHost` admet puis possède le pool réel, sans exposer de handle brut ou de réouverture. Après connexion, il revalide l'admission avant toute requête. Le drainage vérifie l'association immuable, ferme définitivement le pool, attend ses requêtes en vol et seulement ensuite acquitte. Un démarrage retenu pendant un gel ne peut pas exposer de connexion après drainage. Un nouveau binding exige une nouvelle admission et une nouvelle identité.

Le driver workload doit fournir une exclusion des démarrages tardifs avant toute observation, même si le workload paraît déjà terminé. Le reçu est vérifié sur UID/génération et tous les champs du scope de restauration. Arrêt demandé, résultat inconnu ou simple expiration de bail ne suffisent pas : une observation finale doit confirmer la terminaison de l'identité attendue. L'implémentation doit également fencer la tentative au point d'effet de l'arrêt. Aucun driver Kubernetes réel n'est inclus ou simulé comme opérationnel.

## Contre-épreuves et validation

- Préparation initiale : dix échecs du banc dus au cast d'enum Prisma qualifié dans un schéma temporaire absent. Correction de la fixture par domaines locaux sur les enums existants, sans changement des assertions produit.
- Revue : le premier drain acceptait un pool arbitraire. Contre-épreuve réelle PostgreSQL ciblée : 1 échec, 10 cas non sélectionnés. Le host propriétaire remplace cette API ; mauvais host, pool original encore vivant, fermeture définitive et démarrage tardif sont testés.
- Premier passage combiné : 41 succès / 1 échec, balayage historique de chiffrement trouvant une entrée illisible supplémentaire dans la base synthétique partagée. Aucune donnée existante supprimée ni assertion modifiée. Le sous-ensemble a été repris dans une base temporaire vide du même PostgreSQL, contenant seulement la structure existante.
- Passage final du 25 octobre à 22:11 UTC : **50/50**, deux fichiers, zéro omission : 20 cas registre/host/drainage et 30 cas du journal existant. Typage API et `prisma validate` réussis. Revue indépendante favorable après correction de l'identité du pool et ajout du reçu d'exclusion des démarrages.

Les verrous, transactions, persistance, isolement des scopes et la requête bloquée avec fermeture de pool sont réellement exercés sur PostgreSQL. Le journal est amené synthétiquement à QUIESCING, sans préparer de cible physique. La reprise du registre et l'interruption avant acquittement sont des fautes contrôlées, pas une certification d'un crash complet d'hôte. Les drivers workload sont contrôlés ; aucun workload réel n'est arrêté. Aucun rejeu WAL ou restauration cloud n'est effectué.

La migration 0093 n'a été appliquée que dans le schéma temporaire de test. La base temporaire et ce schéma ont été nettoyés après exécution ; aucun nouveau conteneur, volume, accès ou ressource cloud. Aucun rollout de migration.

## Limites avant branchement

1. Brancher les admissions des requêtes API (`inspectPostgresSchema`, `runDatabaseQuery`) et le pool du serveur généré dans `services/api/src/app.ts`, avec résolution de connexion autorisée liée au binding. Ce fichier est partagé : coordonner le delta exact avant édition.
2. Brancher la création des runtimes/workloads dans workspace-manager. Il faut une réservation de démarrage puis une liaison à l'UID réellement attribué, sans fenêtre où un ancien démarrage peut encore ouvrir une connexion après un acquittement. Un UID observé absent à un instant ne suffit pas.
3. Implémenter et vérifier le driver réel d'exclusion/arrêt sur les primitives autorisées ; aucun accès supplémentaire n'est supposé acquis. Les consommateurs directs non gérés restent un refus de capacité.
4. Définir la récupération d'une connexion dont la création échoue (ligne conservée non drainée par prudence) et la rétention des handles définitivement clos. Le host actuel ne nettoie pas ces tombstones ; il n'est pas branché à un trafic production durable.

Sans ces branchements, le registre ne constitue pas un inventaire exhaustif des consommateurs réels. Le coordinateur production reste non injecté et la restauration cloud demeure refusée. Aucun changement de permissions, secrets, quotas ou protections.
