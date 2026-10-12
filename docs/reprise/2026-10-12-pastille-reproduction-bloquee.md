# Pastille « descendre » — reproduction bloquée le 12 octobre 2026

## Périmètre et état

Test ciblé : `tests/e2e/ide-mobile-chrome.spec.ts`, « elle se peint sur le fil, et sur rien d’autre », vers la ligne 2844. Base de la branche locale `fix/pastille-descendre-20261012` : `aacb21f58c1395972145a1992915954d0594e5f0`. Le commit journal `6fdbbbc8f9f49a858eafd124016391a05dc70118` a été conservé séparément.

**Aucune cause produit établie, aucun correctif appliqué et aucun test ciblé exécuté.** La dérogation existante jusqu’au 4 novembre n’a pas été prolongée ; ni le test ni ses assertions n’ont été modifiés.

La fiche historique `BUG-E2E-PASTILLE-001` décrit des passages locaux réussis et une hypothèse de synchronisation. Ces passages n’établissent pas la cause du nouvel échec CI, ni l’absence d’un défaut produit préexistant.

## Preuves CI inaccessibles

Le [run 38254028599](https://github.com/openaxcloud/vibecore/actions/runs/38254028599) expose dans ses métadonnées l’artefact `11752176803`, `playwright-report-tranche-1` (7 640 669 octets), contenant le rapport attendu. Son téléchargement a échoué avec `Forbidden`. Le domaine final de cette tentative ZIP n’a pas été conservé : il n’est pas affirmé ici. Traces et captures non lues, aucune autre route ni nouvelle tentative utilisée.

Pour la tentative antérieure de lecture des logs du job `114827464166`, le domaine observé était `productionresultssa0.blob.core.windows.net` : l’API GitHub redirigeait vers une URL temporaire signée sur Azure Blob, dont l’accès rendait `Forbidden`. `api.github.com` était autorisé, mais cette destination était absente de la liste HTTP autorisée. Aucune URL signée, chaîne de requête ou valeur de jeton n’est conservée dans ce rapport.

## Préparation locale explicitement autorisée

Mémoire mesurée avant démarrage : environ 1,9 Gio utilisés pour une limite cgroup de 16 Gio ; aucune pile applicative active. Les 324 dépendances JavaScript directes correspondaient au lockfile. Aucune installation JavaScript implicite n’a été lancée.

Les trois références exactes de `docker-compose.dev.yml` ont été vérifiées auprès des projets officiels et téléchargées par Docker Hub. Les domaines `auth.docker.io` et `registry-1.docker.io` étaient autorisés. Aucun miroir ou remplacement d’image n’a été utilisé. Les tags du dépôt sont mobiles ; les digests effectivement obtenus sont :

| Référence du dépôt       | Digest obtenu                                                             |
| ------------------------ | ------------------------------------------------------------------------- |
| `pgvector/pgvector:pg16` | `sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a` |
| `redis:7-alpine`         | `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499` |
| `axllent/mailpit:v1.24`  | `sha256:3ad9483ac2dea937ae402b95435ab12c3355d2373a1002a49491db0be536d8fa` |

Sources officielles : [pgvector](https://github.com/pgvector/pgvector#docker), [Redis](https://hub.docker.com/_/redis), [Mailpit](https://mailpit.axllent.org/docs/install/docker/).

Une seule pile a été créée, projet Compose `pastille726`, ports liés à `127.0.0.1`, avec `--pull never` après les téléchargements explicites. PostgreSQL et Redis sont devenus sains. Le healthcheck Mailpit du dépôt (`wget … http://127.0.0.1:8025/api/v1/info`) a retourné `HTTP/1.1 403 Forbidden`. L’origine exacte de cette réponse locale n’a pas été établie : elle n’est pas attribuée sans preuve au proxy réseau ou à Mailpit.

Le moteur natif `schema-engine` de Prisma 7.8.0 est également absent du paquet local `@prisma/engines`. La procédure supportée prépare la base avec `prisma migrate deploy` puis le seed. Le code installé de `@prisma/fetch-engine` désigne `binaries.prisma.sh` comme domaine de téléchargement par défaut ; ce domaine est absent de la liste autorisée. **Aucun téléchargement de ce moteur n’a été tenté** : il s’agit d’un prérequis absent et d’une destination non autorisée, pas d’un refus HTTP effectivement observé sur ce domaine.

La préparation a été arrêtée. Les trois conteneurs créés pour `pastille726` ont été arrêtés ; aucune ressource partagée n’a été supprimée. Les images téléchargées, conteneurs arrêtés et volume de test sont conservés localement. Aucune API/web locale n’a été démarrée, aucun accès cloud facturé ni appel à un modèle n’a été effectué.

## Hypothèse à vérifier, pas cause démontrée

`attendreLeFilStable` considère la chaîne `aucune` comme stable après quatre lectures identiques à 250 ms. Un conteneur absent peut donc satisfaire cette attente. La remontée suivante ne fait rien si elle ne trouve pas de cible (`if (sc)`). C’est une hypothèse précise de précondition insuffisante, pas une reproduction de la panne CI.

Pour conclure, il manque les traces/captures accessibles et une préparation locale supportée fonctionnelle : moteur Prisma exact disponible par un chemin autorisé, puis diagnostic de la réponse Mailpit. Aucun contournement de réseau, modification de politique, assouplissement d’assertion ou relance de workflow n’a été tenté.
