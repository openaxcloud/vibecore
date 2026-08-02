# Correctif base de données — panneau + persistance serveur (prod, 2026-08-02)

Deux défauts signalés lors de la vérification produit du 31/07, corrigés et **prouvés en réel sur la prod** avec un compte jetable (créé, utilisé, supprimé).

## Cause racine (diagnostiquée, pas supposée)

Le plan gratuit provisionne une base **shared tier** (rôle + base logique sur le cluster CNPG `shared-pg-0`). Deux maillons cassés empêchaient la base d'apparaître :

1. **`provisionTenant` (SQL) échouait en `42501 must be able to SET ROLE`.** Postgres ≥16 exige que le rôle créateur soit **membre** du rôle owner pour `CREATE DATABASE … OWNER "<role>"`. L'admin CNPG `app` a CREATEDB/CREATEROLE mais n'est pas membre du rôle tenant fraîchement créé → la base n'était jamais créée → `getConnectionUri('shared')` renvoyait `undefined` → aucun `DATABASE_URL` écrit → panneau bloqué sur « No database yet ». **Reproduit live** dans le pod api avant correctif.
2. **Le garde HTTP du workspace-manager (`dbResourceGuard`) refusait `Pooler` et `Database`** (403 `DB_RESOURCE_FORBIDDEN`), n'autorisant que `{Cluster, ScheduledBackup, Backup}`. Le tier shared applique justement `Pooler` + `Database` → `provisionInstance` 403ait. (Le RBAC k8s du manager accordait déjà `poolers`/`databases` — seule l'allow-list applicative était en retard.)

## Correctifs (PR #70, mergée `9dbbabcd`, déployée live)

- `services/api/src/database-provisioner.ts` — `PgTenantSqlExecutor.provisionTenant` : `GRANT "<role>" TO CURRENT_USER` avant `CREATE DATABASE … OWNER "<role>"` (idempotent).
- `services/workspace-manager/src/app.ts` — allow-list `DB_ROLLBACK_KINDS` étendue à `Pooler` + `Database`. Test ajouté (`app.spec.ts`).

Déploiement confirmé : `deploy-main` vert sur `9dbbabcd`, `api/health` 200, et le `dist` du pod api en cours **contient** `GRANT "${role}" TO CURRENT_USER` (pod démarré après le déploiement).

## Preuve live end-to-end (projet jetable vierge `cmsbxv1zi000n0nasl15no69y`)

Chemin de code RÉEL (pas de SQL manuel) :

| Étape | Avant fix | Après fix (live) |
|---|---|---|
| `POST /database/provision` (tier shared) | instance PROVISIONING, jamais ACTIVE | instance créée, réconciliation écrit `DATABASE_URL` |
| `GET /databases` (connexions — **source du panneau**) | `connections: []` (« No database yet ») | **1 connexion** `postgres` key=`DATABASE_URL`, caps `[schema,readonly-sql,query]`, pooler `shared-pg-0-pooler` |
| `GET /databases/schema` (tables — **panneau**) | vide | table **`tips`** + colonnes |
| `POST /databases/query` (SQL — **panneau**) | — | **2 lignes réelles** renvoyées |
| App écrit via `DATABASE_URL` (pooler, comme `process.env.DATABASE_URL`) | localStorage navigateur | **écriture serveur** dans le Postgres partagé |
| Persistance reload | — | 2 lignes (lectures indépendantes répétées) |
| Persistance **redémarrage workspace** (`ws-bb066fd06b6b18e1` restart) | — | **2 lignes** avant ET après restart |

Réponses API brutes archivées : `api-databases-connections.json`, `api-databases-schema.json`, `api-databases-query.json`. Ce sont exactement les endpoints que le panneau Database appelle (`DatabasePanel` → `/api/projects/:id/database` ; `DatabaseWorkbench` → `/api/projects/:id/ide-panel/database` → `/databases[/schema|/query]`). Capture console : `db-panel.png` (journal d'activité montrant `database.schema.inspect` + `database.query.readonly`).

## Ce que je ne revendique pas

- Je **n'ai pas** capturé le panneau Database rendu *dans l'IDE* : le workspace était PENDING (en redémarrage) et la route d'ouverture directe du panneau a 404é. La preuve du contenu du panneau repose sur ses **endpoints de données exacts** (ci-dessus), qui sont sa seule source. Une capture in-IDE reste à faire quand un workspace est chaud.
- La persistance « redémarrage » est prouvée via un vrai restart de workspace ; la base CNPG est externe au workspace (volumes persistants), donc la survie est structurelle, mais je l'ai vérifiée live plutôt que supposée.

## Nettoyage

Projet supprimé, compte jetable supprimé (flux self-serve), sessions révoquées, secrets locaux purgés.
