# Vérification physique des archives — suite locale du 25 octobre 2026

Branche distincte `feat/restore-archive-verification`, base #785 `6b5c263f078674e604311b9357cffc8e16a14956`. Main observé : `d3adf5be9c94496ea5347328001adba6e99c5e7f`. Les têtes #782 et #785 restent inchangées. Aucune promotion, fusion, activation cloud ou restauration de données utilisateur.

## Fonction implémentée

`verifyPostgresBaseBackup` contrôle les octets du manifeste attendu avant/après vérification, ses plages WAL, le résultat réel de `pg_verifybackup` (analyse WAL activée) et l'identifiant système obtenu par `pg_controldata`. Les erreurs fournisseur sont remplacées par des codes sans diagnostic sensible. Le banc physique historique appelle désormais cette fonction ; son scénario complet avec image historique n'a pas été rejoué.

Le reçu distingue `baseBackupVerified: true` de `pitrCoverageVerified: false`. Seul le format manifeste v1 est admis. Le travailleur doit posséder un répertoire de staging immuable : la relecture du manifeste ne protège pas contre toute mutation ultérieure des autres fichiers. Les attentes doivent provenir d'une source de confiance, pas de l'archive qu'elles servent à vérifier.

## Validation exécutée

Commande : `RESTORE_PHYSICAL_CONTAINER=vibecore-ux-20261021-pg pnpm --dir services/api exec vitest run src/tests/database-restore-archive.spec.ts src/tests/database-restore-archive.physical.spec.ts`.

Résultat final : **9 tests passés, zéro échec, omission ou retry**, deux fichiers, 3,78 s dont 3,52 s physique. Huit tests contrôlés couvrent empreinte, identité, dérive, erreur expurgée, version non supportée et plages WAL invalides. Le neuvième utilise réellement PostgreSQL et ses outils, des clusters temporaires sur sockets Unix dans le conteneur synthétique déjà existant, sans conteneur ou volume supplémentaire.

Le cas physique vérifie une base réelle, refuse un mauvais identifiant puis une altération de PG_VERSION, vérifie à nouveau après réparation de la fixture, poursuit la récupération à une cible temporelle, exclut l'écriture postérieure, redémarre la cible et vérifie le nettoyage. Aucun écouteur TCP n'est créé par ces clusters. Ce n'est pas une restauration cloud ni une preuve de fencing global.

Image réellement utilisée, inspectée à nouveau : `sha256:f1447071e6c8449dcf4056aa0994c81d3566ce5ee232de36b04dc25696a116dd`, digest registre `pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a`, PostgreSQL 160015. L'image historique épinglée absente n'a été ni téléchargée ni présentée comme rejouée. La provenance et le reçu du premier parcours physique sont conservés dans `restore-source-20261025/physical-result.json`.

Une première vérification TypeScript a signalé des références de processus potentiellement nulles et une table de tests mal structurée ; ces erreurs ont été corrigées, sans diminuer les assertions. Les journaux initiaux restent locaux dans `/tmp/restore-archive-typecheck.log`.

## Limites et étapes restantes

Il manque encore le lecteur réel d'archives cloud et la preuve de continuité WAL jusqu'à une cible arbitraire, l'allocation/identité de cible cloud et le raccordement du coordinateur en production. Les refus de capacité restent en place.

Le consommateur coopérant de #782 ne couvre pas tous les clients : introspection/SQL de l'API, pools des serveurs générés, pods déployés et runtimes utilisateur ont des cycles indépendants. Un inventaire durable et une admission/fencing distribuée restent nécessaires pour exclure les anciennes tentatives et permettre une bascule sûre. Aucun arrêt de client réel n'a été tenté. Le présent lot ne change pas ces autorisations ou capacités.
