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

`account-purge-db.spec.ts` : **29/29**, exit 0, PostgreSQL 16.13 migré.
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

## Le test de course retiré, et ce qui le remplace

Le test (21) préexistant (« renewal vs reclaim race ») encodait l'ancien comportement en
laissant le renouvellement gagner sur un lease expiré depuis 10 s. Il passe toujours,
mais il est devenu **déterministe** : le renouvellement perd systématiquement. La suite
perdait donc un test de concurrence.

En cherchant à le restaurer, le constat est plus fort que prévu — **la course n'est pas
seulement décidée, elle est impossible** :

```
renew   exige   leaseExpiresAt >  now
reclaim exige   leaseExpiresAt <  now - reclaimGraceMs      (grâce = 60 s > 0)
```

Ces deux prédicats sont **disjoints**. Aucun état de lease ne peut être candidat aux
deux, et la fenêtre intermédiaire (expiré mais encore dans la grâce) n'appartient à
personne : le propriétaire doit s'arrêter, le reconciler doit attendre.

Le test `renew and reclaim are DISJOINT` épingle les trois régions sur vrai Postgres —
`[renouvelable, candidat au reclaim]` valant `[true,false]`, `[false,false]`,
`[false,true]`. Un invariant est une affirmation plus forte qu'un interleaving
échantillonné, et il ne peut pas devenir silencieusement unilatéral comme l'a fait le
test (21).

Il discrimine : sans la garde, le lease **expiré mais dans la grâce** redevient
`[true, false]` — renouvelable, c'est-à-dire ressuscité — au lieu de `[false, false]`.

---

# CronJob de purge — état honnête (IMPLEMENTED_UNPROVEN maintenu)

Le second expert demande de prouver le CronJob de purge en cluster de test. **Je ne peux
pas le déclarer prouvé**, et voici pourquoi, avec la cause exacte.

## Pourquoi il n'a jamais tourné

Le cluster d'audit `vibecore-audit-test-20260807` (projet GCP distinct de la prod) porte
bien la plateforme : release Helm `vibecore` révision 10, **10 CronJobs actifs**
(`workspace-gc`, `siem-deliver`, `inactivity-gc`, …).

`account-purge` n'en fait **pas** partie, et ce n'est pas un incident de déploiement :

```
$ git show origin/main:infra/helm/platform/templates/cronjobs.yaml | grep -c accountPurge
0
$ git log -1 -S accountPurge -- infra/helm/platform/templates/cronjobs.yaml
04e40a6e feat(purge): exécuteur réel de purge de compte (§16.12)
```

`accountPurge` **n'existe pas sur `main`** — il est introduit par le lot lui-même. Le
cluster tourne un chart issu de `main`, il ne peut donc pas l'avoir. Autrement dit : le
CronJob de purge n'a jamais tourné **nulle part**, parce que le changement de chart qui
le crée est encore non mergé dans cette PR. Idem pour `workspaceFreezeReconcile`, ajouté
en R-P3-07.

## Ce qui EST prouvé

Les deux CronJobs sont validés **server-side contre l'API réelle** du cluster d'audit —
schéma et admission compris, sans rien persister :

```
$ kubectl --context gke_vibecore-audit-test-…-audit-cluster apply --dry-run=server -n vibecore -f purge-crons.yaml
cronjob.batch/vibecore-vibecore-platform-cron-account-purge created (server dry run)
cronjob.batch/vibecore-vibecore-platform-cron-workspace-freeze-rec created (server dry run)

$ kubectl … get cronjobs -n vibecore | grep -cE 'account-purge|freeze-rec'
0        # rien créé — c'était bien un dry-run
```

Schedules rendus : `account-purge` → `30 4 * * *`, `workspace-freeze-reconcile` →
`20 * * * *`.

## Ce qui n'est PAS prouvé

- Aucune **exécution planifiée réelle** observée : pas de Job créé par le contrôleur cron,
  pas de log de pod, pas de trace d'un balayage.
- Le comportement du job (auth, propagation des non-2xx, compteurs) n'est couvert que par
  ses tests unitaires (`workspace-freeze-reconcile.spec.ts`, 10/10), pas par un run cluster.

## Pourquoi je n'ai pas déployé pour le prouver

Il aurait fallu déployer une branche **non mergée** sur un cluster **partagé** — d'autres
sessions y travaillent (namespaces `qa-corebugs-*`, `qa-ws-*` actifs). C'est une mutation
d'infrastructure commune que rien dans le mandat n'autorise, et sur un lot en
contre-audit elle brouillerait la frontière entre « prouvé » et « poussé pour prouver ».

**Le point reste donc IMPLEMENTED_UNPROVEN**, et la voie propre est de le prouver après
merge, quand le chart porte réellement les deux CronJobs.
