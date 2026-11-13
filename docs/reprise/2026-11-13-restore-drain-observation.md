# Contre-vérification PostgreSQL du drainage

Base : main `b381e94` (PR916). Restauration production toujours refusée par
`503 RESTORE_APPLICATION_CUTOVER_UNAVAILABLE`. Aucun consommateur production,
secret, donnée réelle, permission ou configuration d'admission n'est modifié.

## Brique intégrée

`observePostgresRestoreDrain` ouvre une connexion de contrôle courte et une
transaction en lecture seule. Elle vérifie l'identifiant système PostgreSQL et
le nom de base attendus, puis compte toutes les autres sessions de cette base
(active, idle et états inconnus), ainsi que ses transactions préparées. Les tags
`application_name` ne servent pas de filtre : un client peut les modifier.
Aucun PID n'est tué, aucune transaction préparée n'est résolue. Le résultat ne
contient ni URI, ni requête applicative, ni identifiant de transaction préparée.
Les échecs réseau/SQL sont rendus sous forme de codes sans détails sensibles.

Le banc de restauration physique exige maintenant une observation vide après
le drainage du consommateur et avant de produire son reçu de quiescence.
La recette CI PostgreSQL obligatoire ajoute les contre-épreuves identité et
session idle non taguée. Le test multiprocessus SIGKILL exige que l'observation
voie encore le backend bloqué, en plus du client de contrôle du test.

## Limites impératives

`observedEmpty` est une observation ponctuelle, pas un verrou ; `globalFence`
est toujours `false`. Les deux compteurs ne constituent pas un snapshot atomique
du passage d'une session à une transaction préparée. Même un résultat vide n'empêche pas une reconnexion un
instant plus tard. Les connexions à d'autres bases et les effets externes ne
sont pas exclus. L'identifiant système ne distingue pas un clone physique de
son origine : l'adaptateur doit toujours prouver l'identité cible/URI.

Cette brique ne fournit donc pas encore le registre exhaustif des consommateurs,
la fermeture durable de leur admission, leur drainage global, le contrôle des
effets en cours des anciens workers ni la reprise après crash. Une période de
silence, un timeout et la mort d'un processus ne sont jamais des preuves de
fencing. Les sessions techniques (par exemple autovacuum) rendent le contrôle
conservateur : il peut refuser un drainage, jamais les ignorer pour réussir.

## Validation

- Tests déterministes : succès vide étiqueté non-global, sessions et transactions
  préparées non nulles, identités incorrectes, compteurs invalides, erreurs
  réseau/SQL/commit nettoyées et fermeture du client.
- Régressions PostgreSQL réelles obligatoires via
  `scripts/qa/database-restore-ci.ts`. Sans PostgreSQL synthétique, les tests
  conditionnels omis ne constituent pas une preuve réelle.
- La branche CI doit valider les tests réels avant fusion ; aucune preuve de
  restauration globale ou de plateforme achevée n'est revendiquée.

Le scénario réel de transaction préparée n'est pas encore validé : le service
PostgreSQL CI utilise `max_prepared_transactions=0`. Les compteurs préparés sont
actuellement couverts par injection déterministe, pas par `PREPARE TRANSACTION`.
