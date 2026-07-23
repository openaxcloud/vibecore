# Course reaper / revive / attach — fermée fail-closed (expert V3 §C)

Refus expert du correctif Import/billing : « une course subsiste entre récupération d'une réservation orpheline, reaper d'expiration et attache du job ».

## L'interleaving (avant)

1. le reaper SÉLECTIONNE une réservation `ACTIVE` expirée ;
2. un retry la REVIVE et étend son expiration (reste `ACTIVE`) ;
3. le reaper applique son passage à `EXPIRED` **sans comparer version/ancienne expiration** → il l'expire à tort ;
4. le retry crée le job ;
5. `attachJob` l'attache à une réservation désormais `EXPIRED` (son prédicat n'exigeait pas `status: ACTIVE`).

→ settlement qui échoue après création du job, ou job sans hold actif.

## Correction (fail-closed)

| Exigence expert | Correction |
|---|---|
| `expiresAt <= now` OU version dans le CAS du reaper | **Les deux.** `releaseReservation(id, 'timeout', {requireExpiredBefore: now, expectedVersion})` : le CAS exige `expiresAt <= now` **et** `version = <celle sélectionnée>`. Une revive qui étend l'expiry ET bumpe la version fait matcher 0 ligne. |
| sérialiser revive/reap par verrou ou version | Colonne **`version`** (optimistic lock, migration `0079`) bumpée à CHAQUE transition (reserve/revive/release/expire/commit/compensate). Le reaper sélectionne `{id, version}` et l'épingle dans son CAS. |
| `status: ACTIVE` + bonne version dans `attachJob` | `attachJob(org, key, job, expectedVersion)` : CAS `where {importJobId: null, status: 'ACTIVE', version: expectedVersion, expiresAt: {gt: now}}`. Une réservation expirée ou re-armée (version bougée) matche 0 ligne → refus. La route abandonne fail-closed (`IMPORT_RESERVATION_EXPIRED_BEFORE_ATTACH`). |

## Preuves vrai Postgres (`test-runs-raw.txt`, 74/74 sur 6 suites)

`import-billing-db.spec.ts` bloc « PR #39 V3 §C » :

- **C1 — interleaving EXACT** : reserve orpheline expirée → le reaper SÉLECTIONNE `{id, version=v}` → une revive l'étend + bumpe (v+1) → le CAS du reaper `{version: v, expiresAt<=now}` renvoie `released: false` → la réservation reste **ACTIVE** (version v+1, expiry future) → attach à v+1 = `attached`, jamais sur une expirée.
- **C2 — fail-closed attach** : reserve expirée, le reaper l'EXPIRE (sans revive), puis attach à la dernière version vue = **`conflict`** ; `importJobId` reste `null` (aucun job sur un hold expiré).
- **C3 — fuzz concurrent** : reaper vs revive lancés ensemble 12× sur connexions séparées → invariant vérifié à chaque tour : un job n'est attaché QUE si la réservation est `ACTIVE` ; jamais d'`EXPIRED` avec un job attaché.

Non-régression : A1–A4, B1–B4, C(#39-3), A1/A2/A3 (orphan recovery), ledger-store-db (7), import-routes (13), state-machine E2E — tous verts.

## Rejouer

```bash
cd packages/database && DATABASE_URL=... npx prisma migrate deploy   # applique 0079
cd services/api && DATABASE_URL=... npx vitest --run \
  src/tests/import-billing-db.spec.ts src/tests/ledger-store-db.spec.ts
```

Statut : **PROVEN_REVIEW_PENDING** — pas de merge sans feu vert.
