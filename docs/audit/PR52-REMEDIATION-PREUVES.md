# PR #52 — remédiation des réserves : correctif + preuves d'exécution

**SHA final : voir la tête de `fix/pr52-reserves-remediation`.**
**NON MERGÉE en prod — livrée pour contre-audit.**

## 1. Ce qui a réellement été trouvé

La réconciliation de version (`PR52-RECONCILIATION-VERSIONS.md`) disait « à
prouver » pour #1 et #3a, « à instruire » pour #2, « ouverte » pour #3b.
Instruction faite, par lecture **puis** par exécution :

| Réserve | État réel | Action |
|---|---|---|
| **#1** garde avant les lectures | déjà corrigée | **prouvée** (test + mutation) |
| **#2** reclaim inline sans garde | **déjà un CAS** — la conversion demandée était faite | **prouvée** (test + mutation) |
| **#3a / T21** renew ressuscitant une lease expirée | déjà corrigée, **et le test T21 assertait déjà `null`** | **prouvée** (test + mutation) |
| **#3b** pas de verrou jusqu'au commit | **OUVERTE** | **CORRIGÉE** (rouge→vert) |

Deux points du brief se sont révélés caducs à l'instruction, et je ne les ai
donc pas « corrigés » pour la forme :
- **#2** : le reclaim est déjà
  `DELETE … WHERE id AND version AND status AND leaseExpiresAt < now()−grace`,
  avec `count = 0 ⇒ refus`. C'est exactement la forme CAS réclamée.
- **T21** : le test « death-before-renew » (−10 s ⇒ `toBeNull()`) existe déjà et
  passe. Il n'acceptait plus à tort.

## 2. Le correctif — réserve #3b

`services/api/src/prisma-store.ts`, transaction de finalisation.

Le dernier `guard()` s'exécute sur le client **poolé**, donc **hors** de la
transaction : entre « la lease est à nous » et le tombstone, plus rien ne tenait
la ligne `PurgePlan`. Tout chemin ne prenant pas le verrou advisory par
utilisateur (un réconciliateur, par exemple) pouvait voler le plan dans cette
fenêtre, et le tombstone — une anonymisation **irréversible** — était posé
quand même.

```sql
SELECT ("ownerToken" = $2 AND status = $3 AND "leaseExpiresAt" > now()) AS alive
  FROM "PurgePlan" WHERE id = $1 FOR UPDATE
```

Le verrou de ligne est tenu **jusqu'au COMMIT** : une fois ce contrôle passé,
aucune instruction concurrente ne peut changer propriétaire, statut ou
expiration avant le tombstone. Le prédicat est évalué par Postgres sur la ligne
verrouillée (`now()`, pas l'horloge applicative) : il ne reste **aucune** fenêtre
check→act. Échec ⇒ `throw` ⇒ rollback complet : pas de `purgedAt`, pas de preuve
d'effacement, compte re-queué.

## 3. Les preuves

`services/api/src/tests/account-purge-interleaving-db.spec.ts` — **vrai
Postgres**, 4 tests, chaque course rendue déterministe par un seam et la
mutation concurrente émise depuis une **seconde connexion Prisma indépendante**.

Pas d'eraser injecté posant ses propres gardes (**piège T22**) : les tests
pilotent le VRAI `eraseSubjectStorage`, le VRAI `acquirePurgeGuarantee` et la
VRAIE transaction de finalisation. Seuls les **ports de stockage** sont des faux,
et la garde utilisée est celle que le store fabrique et thread lui-même.

### Rouge → vert (réserve #3b)

```
AVANT le correctif :
   ✓ T21 — renewing an ALREADY-EXPIRED lease returns null …
   ✓ #1  — a lease lost DURING the reads aborts before any bucket or PVC is deleted
   ✓ #2  — an owner renewing between the read and the inline reclaim blocks the second purge
   ×  #3b — a lease lost after the last guard but before commit rolls back the tombstone
      Tests  1 failed | 3 passed (4)

APRÈS le correctif :
   ✓ src/tests/account-purge-interleaving-db.spec.ts (4 tests)
      Tests  4 passed (4)
```

### Les tests verts d'emblée ont-ils des dents ?

Un test vert ne prouve rien s'il ne peut pas devenir rouge. Chacun a donc été
validé par **mutation du code de production** (mutation posée → test rouge →
code restauré) :

| Mutation posée | Test qui vire au rouge |
|---|---|
| garde déplacée **avant** les lectures (`account-storage-purge.ts`) | **#1** |
| reclaim converti en `DELETE … WHERE id` (sans CAS) | **#2** |
| `leaseExpiresAt: { gt: now }` retiré du CAS de renew | **T21** |
| `FOR UPDATE` absent (état d'origine) | **#3b** |

## 4. Une impossibilité structurelle à consigner

Le scénario littéral de #2 — « l'owner appelle `renewPurgeLease` entre la lecture
et le reclaim » — est **structurellement impossible** une fois #3a en place : le
reclaim n'est tenté que si la lease a lapsé, et #3a interdit précisément de
renouveler une lease lapsée. **Les deux gardes composent.** La course réelle est
donc modélisée par l'écriture qu'un heartbeat vivant produit (lease poussée +
version incrémentée) depuis l'autre connexion. Ce qui est sous test est le **CAS
du reclaim**, pas le renew.

## 5. État CI

- suite `account-purge*` (vrai Postgres) : **44 passed**
- suite API complète : **1704 passed, 1 skipped, 0 échec**
- `pnpm run lint` : **0**
- `typecheck` API : **0 erreur**

⚠️ Deux gardes de source i18n (`app-public-copy.spec.ts`) échouaient sur cette
branche **avant** ce lot (vérifié en remisant ; 31/31 sur `origin/main`) : la
lignée PR #52 avait introduit des codes internes sans les déclarer. Elles sont
désormais déclarées et documentées — 18 des 20 entrées ajoutées préexistaient à
ce lot, 2 viennent du message d'erreur de #3b.

## 6. Merge et non rebase — justification

La branche était à 36 commits devant `main` et 59 derrière ; **14** de ces
commits touchent `prisma-store.ts` et **12** `app.ts`. Rebaser à travers cette
surface, c'est 36 occasions de résoudre un conflit **dans la logique de purge
précisément sous audit**, et présenter ensuite à l'expert une histoire réécrite
plutôt que le travail relu. Le dépôt a déjà tranché ce cas (BUG-REMIX-001 :
« résolu par merge et non rebase, afin que le SHA signé reste ancêtre littéral
de main »).

Le merge n'a produit **qu'un** conflit, sur `docs/parity/DOCUMENT_MANIFEST.yaml`
— fichier généré dont l'en-tête interdit l'édition manuelle — résolu par
**régénération**. Aucun fichier de code n'a eu de conflit.

`git merge-base --is-ancestor origin/main HEAD` = **vrai**.
