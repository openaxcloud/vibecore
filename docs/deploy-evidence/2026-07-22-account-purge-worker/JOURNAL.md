# Journal — preuve PG du worker de purge de compte — 2026-07-22

Toutes les commandes jouées depuis le worktree de la branche
`feat/account-deletion-purge-worker` (basée sur `origin/main`), machine locale
(Darwin), Docker Desktop.

## 1. Conteneur Postgres jetable (pgvector obligatoire)

```
$ docker run -d --name purge-proof-pg -e POSTGRES_DB=vibecore -e POSTGRES_USER=vibecore \
    -e POSTGRES_PASSWORD=vibecore -p 55440:5432 pgvector/pgvector:pg16
2449c99183803501d23956fb71eefc7b6a32c371bde371862a1e6a06b81b8807
$ docker exec purge-proof-pg pg_isready -U vibecore -d vibecore
READY
```

## 2. Migrations réelles (0001 → 0078)

```
$ cd packages/database && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
    prisma migrate deploy --schema prisma/schema.prisma
…
  └─ 0078_double_entry_ledger/
    └─ migration.sql
All migrations have been successfully applied.
```

Les triggers d'immutabilité du ledger (mig 0078) sont donc actifs dans la base
de preuve — le test (5) les exerce réellement.

## 3. Preuve DB-gatée (4/4 verts) — `purge-db-run1.log`

```
$ cd services/api && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
    vitest run --config vitest.config.ts src/tests/account-purge-db.spec.ts

stdout | … (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned
prisma:error Ledger LedgerTransaction is append-only: DELETE refused. …

 ✓ src/tests/account-purge-db.spec.ts (4 tests) 899ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Scénario complet du test (1+3) : compte créé avec données dans plusieurs
classes (session, org, projet, import, conversation IA + message, usage event
financier, entrée d'audit) → suppression demandée → **fenêtre simulée échue en
reculant `requestedAt` DANS LA DB (jamais l'horloge)** → route worker
`/internal/account-purge` exécutée (`enabled:true`) → vérifications SQL par
classe (« 0 ligne restante ») → preuve d'effacement **relue depuis la table
`AdminAuditLog`** → re-run = no-op (`already_purged`, toujours 1 seule preuve).

## 4. Vérification SQL brute post-purge — `purge-sql-verification.log`

Extraits (6 tombstones car la suite complète a rejoué la spec sur la même DB) :

```
 id                        | email                                           | name | pwd_null | purged_at
 cmrvpdz4t000fi0lnerebnm5i | purged-cmrvpdz4t000fi0lnerebnm5i@erased.invalid |      | t        | 2026-07-22T06:30:27.400Z
 sessions_left            = 0
 convs_left               = 0
 memberships_left         = 0
 Organization             : name='Purged account', slug='purged-<orgId>' (anonymisées)
 ledger_tx_retained       = 2   (transactions postées JAMAIS supprimées)
 usage_retained_detached  = 6   (UsageEvent conservés, userId=NULL)
 AdminAuditLog account.purge_completed : verifiedZeroRemaining=true, 17 classes, 3 exceptions
 AuditLog du purgé        : ipAddress=NULL, metadata={"redacted": true, …} (rédigé, ligne conservée)
```

Une preuve complète est copiée dans `proof-sample.json` (relue via
`jsonb_pretty(metadata->'proof')`).

Bilan par classe (test 1+3) : **supprimées** sessions=1, ai_history
(1 conversation + 1 message), projects=1, imports=1, memberships=1, chaque
classe recomptée à **0 ligne** ; **anonymisées** audit_logs (rédigés),
user_references (UsageEvent détaché), organizations (shell), profile
(tombstone) ; **conservées consignées** financial_records
(UsageEvent=1, fail-closed 7 ans), ledger (immutabilité 0078),
shared_org_content.

## 5. Suites vitest (même DB réelle)

```
$ vitest run src/tests/account-purge-routes.spec.ts   → 9 passed (9)
$ vitest run --config vitest.config.ts                → Test Files 159 passed | 1 skipped (160)
                                                        Tests 1303 passed | 1 skipped (1304)
```

## 6. Rendu Helm du CronJob

```
$ helm template vibecore infra/helm/platform --set global.imageTag=testtag | grep cron-account-purge
  name: vibecore-vibecore-platform-cron-account-purge
  schedule: "30 4 * * *"
```

## 7. Teardown

```
$ docker rm -f purge-proof-pg
```
