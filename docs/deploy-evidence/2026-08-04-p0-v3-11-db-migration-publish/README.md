# P0-V3-11 — migration de base au Publish : câblage réel + non-corruption prouvée

Date : 2026-08-04 · Branche : `feat/p0-v3-11-db-migration-publish` · Contrat :
[`DATABASE_CONTRACT`](../../parity/DATABASE_CONTRACT.md) v2

**Statut : OPEN.** Ce lot câble la machine et prouve la non-corruption ; il ne
clôt pas le point. Clôture sur **signature expert** uniquement.

## Le refus auquel ce lot répond

> « contrat sans DBMigrationExecution, clé idempotence ni protocole complet
> mutation PROD » — `P0_REGISTRY.yaml`, `refusalType: PREUVE_INSUFFISANTE`

## Ce que l'audit de l'existant a révélé

1. **Aucune migration au Publish, nulle part.** La route
   `POST …/deployments/:id/publish` provisionnait un cluster CNPG de production
   **vide** et copiait des *fichiers* dans un workspace prod — sans jamais
   appliquer la moindre instruction DDL. Une application publiée démarrait donc
   sur une **base de production vide**. Le script de boot du déploiement n'a pas
   d'étape `migrate`.
2. **La machine à états était du code mort.** `PLANNED → … → COMMITTED` existait
   en module pur, importé par son seul test : ni modèle, ni route, ni exécuteur.
3. **`BACKUP_VERIFIED` était insatisfiable.** `takeSnapshot()` soumettait un CR
   `Backup` CNPG et renvoyait `{applied: true}` immédiatement ; **aucun code ne
   relisait jamais son statut**. Sans lecture de phase, « backup vérifié » ne
   pouvait signifier que « backup demandé ».
4. **`migrationMayStart()` n'était pas un verrou.** Il décide à partir d'une
   liste passée en mémoire : fenêtre de course entre le SELECT et l'INSERT, et
   aveugle aux autres replicas (l'API tourne en 2, HPA → 6).

## Ce qui est livré

| Brique | Fichier |
|---|---|
| Table + verrou + idempotence | `packages/database/prisma/migrations/0082_db_migration_execution` |
| Exécuteur (machine à états) | `services/api/src/db-migration-execution.ts` |
| Applicateur transactionnel | `services/api/src/db-migration-applier.ts` |
| Vérification de backup réelle | `backupStatus()` dans `database-provisioner.ts` |
| Câblage Publish | `services/api/src/app.ts` (avant `createDeployment`) |

- **Verrou tenu par le SGBD** : index UNIQUE sur `activeLock`
  (`<projectId>:<environment>`, NULL une fois terminal). Postgres traitant les
  NULL comme distincts, une seule migration active par (projet, env) — la 2e
  reçoit une violation d'unicité, y compris depuis un autre replica.
- **Backup vérifié au sens fort** : phase CNPG `completed` lue sur le CR. Sans
  cette preuve → refus, **aucune instruction exécutée**.
- **Ordre** : la migration tourne **avant** la création du déploiement de
  production. Un échec refuse le publish (409) ; la prod garde sa version.
- **Idempotence à deux niveaux** : clé `publish:<deploymentId>:<empreinte>` côté
  plateforme, registre `_ecode_schema_migrations` côté base du projet.

## Preuve réelle — PostgreSQL 16.13

Le cœur de la promesse est une propriété du **moteur** : en PostgreSQL le DDL est
transactionnel. Aucun double en mémoire ne peut le prouver, donc la preuve tourne
contre un vrai serveur.

**Le test qui compte** — « un lot qui échoue à mi-parcours ne laisse AUCUNE
trace » : deux clients préexistants, un lot de 2 migrations dont la seconde
échoue. Après l'échec, la table créée par la première a **disparu**, le registre
n'a **rien** enregistré, et les deux clients sont **intacts**.

**Publish réel bout-en-bout** : route HTTP `publish` appelée pour de vrai,
applicateur réel, `CREATE TABLE` effectivement présent et utilisable ensuite
(INSERT + SELECT vérifiés).

## Négatifs prouvés

| Cas | Résultat |
|---|---|
| Backup jamais abouti (timeout) | refus, `applySql` **jamais appelé** |
| Backup en phase `failed` | refus, aucune instruction |
| Backup non lançable | refus, aucune instruction |
| Provisionneur inerte | refus (garde anti-régression) |
| 2e migration concurrente | `MIGRATION_LOCK_HELD` (409) |
| Cible prod injoignable | `MIGRATION_TARGET_UNAVAILABLE` (409) |
| Échec pendant l'application | `FAILED_SAFE`, verrou libéré |
| COMMIT non confirmé | `MANUAL_RECOVERY` — jamais un « base inchangée » présumé |
| Moteur MySQL | `MIGRATION_ENGINE_UNSUPPORTED` |

## Résultats

| Contrôle | Résultat |
|---|---|
| Tests migration (3 fichiers) | **26/26 vert**, dont **5 sur vrai PostgreSQL** |
| Suite complète `services/api` | **1354 vert**, 35 skipped, **0 échec** |
| `tsc --noEmit -p tsconfig.json` | **0 erreur** |
| `validate-registries.mjs` | **0 violation** |

## Reproduire

```bash
docker run -d --name v311-pg -e POSTGRES_PASSWORD=v311 -e POSTGRES_DB=v311 \
  -p 55432:5432 postgres:16-alpine
cd services/api
V311_TEST_DATABASE_URL=postgres://postgres:v311@127.0.0.1:55432/v311 \
  vitest run src/db-migration-execution.spec.ts \
             src/tests/db-migration-publish.spec.ts \
             src/tests/db-migration-applier.integration.spec.ts
```

Sans `V311_TEST_DATABASE_URL`, les tests vrai-PG sont **sautés** (et le disent)
plutôt que de passer au vert sans rien avoir vérifié.

## Artefacts

| Fichier | SHA-256 |
|---|---|
| `artifacts/migration-tests.txt` | `beeb2c49915ac22bb12ce2dd01e0cf1bc06d5b90854fcb04185c2b01a160a0b6` |
| `artifacts/0082_db_migration_execution.sql` | `c0cd4cdfa76b1c571a17debccc524a824304d20a0e815a550f73af304cad6a52` |
| `artifacts/postgres-version-and-state.txt` | `42c3e5414c42420e2ec267928e33b5692e575788c35c26380ede21382e09b9e5` |

`artifacts/SHA256SUMS.txt` fait foi.

## Reste ouvert (déclaré, pas gonflé)

1. **Restaurabilité du backup non prouvée** — `phase: completed` atteste que le
   backup a abouti, **pas** qu'un restore réussirait (drill PITR requis).
2. **Migration live sur CNPG de production non jouée** — les preuves tournent sur
   un PostgreSQL réel local.
3. **Pas de down-migration** — la sûreté vient du ROLLBACK, pas d'un inverse.
4. **PostgreSQL uniquement** — MySQL refusé faute de DDL transactionnel.
