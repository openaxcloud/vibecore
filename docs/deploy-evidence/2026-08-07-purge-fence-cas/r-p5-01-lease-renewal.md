# R-P5-01 — un lease de purge expiré ne peut plus être renouvelé

Réserve du second expert sur la tête `6a9babdc`, **distincte** de l'ABA R-P3-06.

## L'état interdit

`workspace-manager` décide qu'un propriétaire de fence est vivant avec
`leaseExpiresAt > now` (`isPurgeFenceOwnerLive`). Dès que le lease lapse, son reconciler
« stale » est en droit de **lever la barrière de purge**.

`PrismaApiStore.renewPurgeLease` faisait son compare-and-set sur
`(id, ownerToken, version, status)` — **sans jamais vérifier que le lease était encore
vivant**. Un renouvellement arrivant après le décès ressuscitait donc le lease alors que
la barrière était déjà tombée :

> **lease redevenu valide + barrière levée** — une purge qui se croit toujours
> propriétaire d'un runtime redevenu reprovisionnable.

## Le correctif

La condition d'expiration entre **dans le même UPDATE conditionnel**, évaluée par
Postgres sous le verrou de ligne — aucune fenêtre entre « est-il vivant ? » et
« prolonge-le » :

```ts
const now = new Date();
where: { id, ownerToken, version: expectedVersion, status: ACTIVE, leaseExpiresAt: { gt: now } }
data:  { leaseExpiresAt: new Date(now.getTime() + ttlMs), version: nextVersion }
```

Un lease mort matche 0 ligne → `null`, exactement comme perdre le CAS de version : le
caller **s'arrête**, il ne réessaie pas. La récupération passe par le chemin de reclaim
(un plan neuf), jamais par une résurrection.

**Un seul `now`** sert au garde et à la nouvelle expiration : la frontière est un instant
unique, pas deux lectures d'horloge. `now === leaseExpiresAt` est **EXPIRÉ** — le même
`>` strict que `validatePurgeLease` (api) et que la recherche de liveness du manager. Les
trois tiers ne peuvent donc pas diverger.

## Rejouer

```bash
# PostgreSQL 16 avec les VRAIES migrations (db push ne crée pas les triggers)
docker run -d --name purge52-pg16 -e POSTGRES_USER=vibecore \
  -e POSTGRES_PASSWORD=purge52_local -e POSTGRES_DB=purge52_cas -p 55433:5432 pgvector/pgvector:pg16
docker exec purge52-pg16 psql -U vibecore -d postgres -c "CREATE DATABASE purge52_mig;"
docker exec purge52-pg16 psql -U vibecore -d purge52_mig -c "CREATE EXTENSION IF NOT EXISTS vector;"
cd packages/database && DATABASE_URL="postgresql://vibecore:purge52_local@127.0.0.1:55433/purge52_mig" \
  ../../node_modules/.bin/prisma migrate deploy

cd ../../services/api
DATABASE_URL="postgresql://vibecore:purge52_local@127.0.0.1:55433/purge52_mig" \
  ../../node_modules/.bin/vitest --run src/tests/account-purge-db.spec.ts
```

⚠️ **Utiliser `migrate deploy`, pas `db push`.** `db push` synchronise le schéma mais ne
joue pas le SQL des migrations : les 5 triggers (dont l'immuabilité du ledger, mig 0078)
n'existent alors pas, et le test (5) échoue pour une raison qui n'a rien à voir avec le
code. Vérification : `select count(*) from pg_trigger where not tgisinternal;` → 5.

## Résultats

`account-purge-db.spec.ts` : **28/28**, exit 0, PostgreSQL 16.13 migré.
workspace-manager **132/132** · api purge voisines **25/25**.

## Les tests sont discriminants (vérifié)

Rejoués contre le code d'avant (garde `leaseExpiresAt: { gt: now }` retirée) :

| Test | vs code d'avant |
|---|---|
| `renew-before-death` (lease vivant à 1 ms près) | **PASS** — le cas positif doit continuer à marcher |
| `death-before-renew` (expiré depuis 10 s) | **FAIL** — `expected 1 to be null` : le lease mort ÉTAIT renouvelé, version portée à 1 |
| `boundary: now === leaseExpiresAt` | **FAIL** — `expected 1 to be null` |
| `the forbidden state is unreachable` | **FAIL** — `expected 1 to be null` |

Les trois négatifs échouent avec la même signature, et le positif reste vert : le banc
discrimine la garde et rien d'autre.

## Déterminisme

Les deux ordonnancements et la frontière sont pilotés à l'horloge **gelée**
(`vi.useFakeTimers({ toFake: ['Date'] })` — Date seulement, l'I/O Prisma est intacte), et
non par des délais. `renew-before-death` utilise un lease vivant **d'exactement 1 ms**,
le cas passant le plus serré.

## Réserve

Le test (21) préexistant (« renewal vs reclaim race ») encodait l'ancien comportement en
laissant le renouvellement gagner sur un lease expiré depuis 10 s. Il passe toujours,
mais il est désormais **déterministe** : le renouvellement perd systématiquement et c'est
le reconciler qui gagne. Cette assertion `expect(renewWon).not.toBe(reconWon)` reste
vraie, ce qui est cohérent — mais elle ne teste plus une vraie course.
