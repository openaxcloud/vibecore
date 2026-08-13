# Rollback — ce que le PERDANT d'une course laisse derrière lui (réserves expert P0/P1/P2)

Le compare-and-set lui-même est `SIGNED_PROVEN`. Ces trois réserves portent sur le
**nettoyage côté perdant** — là où un refus cesse d'être un refus.

## P0 — arrêt fail-open : le workload obsolète restait PUBLIQUEMENT ACTIF

Le chemin perdant appelait `stopServerDeploymentViaManager(...).catch(() => undefined)`, et
ce helper avale **tout** — y compris un statut HTTP non-OK. Un 500 du manager, un timeout ou
un crash ressemblaient donc exactement à un arrêt réussi : ligne écrite `FAILED`, appelant
servi d'un 409 propre, et le N-1 obsolète **toujours en train de servir**. La base disait
une chose, le cluster en servait une autre.

**Correctif** — `retireServerWorkloadOrThrow` :

1. arrêt **strict** (lève sur non-OK / timeout) ;
2. **constat** de la disparition auprès du manager. Seul `exists === false` compte comme
   preuve : `undefined` signifie que l'appel de statut a lui-même échoué, et traiter
   « je n'ai pas pu vérifier » comme « c'est parti » serait le même fail-open un cran plus bas ;
3. si la disparition n'est pas prouvée → `StaleWorkloadActiveError`, et l'appelant **escalade
   au lieu de déclarer FAILED tranquillement** :
   - la ligne n'est **pas** mise en `FAILED` (elle mentirait pendant qu'un pod sert),
   - elle est marquée `staleWorkloadActive` + hôte + cause,
   - log **error**,
   - réponse **500 `ROLLBACK_STALE_WORKLOAD_ACTIVE`** (et non 409), pour que l'appelant sache
     que le refus n'a pas pleinement pris effet.

## P1 — idempotence durable absente : oscillation de versions

Un rollback n'est pas naturellement idempotent : le rejouer **coupe une nouvelle release**.
Un client qui perd sa 201 (timeout de proxy, redémarrage de pod, connexion coupée) et
réessaie faisait donc osciller l'environnement v1 → v2 → v1, sans retour à un état connu.
Un index en mémoire ne corrige rien : le retry atterrit le plus souvent sur une autre
réplique, et un redémarrage oublie tout.

**Correctif** — table `RollbackIdempotency` (migration `0084_rollback_idempotency`) avec
`@@unique([projectId, environment, key])`. **La revendication EST l'INSERT** : c'est
Postgres, et non le minutage applicatif, qui tranche.

- clé lue dans l'en-tête `Idempotency-Key` (opt-in : sans clé, comportement inchangé) ;
- gagnant → exécute ; la réponse est persistée dans un hook **`onSend`**, donc **attendue par
  Fastify avant que la réponse ne parte**. Le faire après `reply.send` laisserait précisément
  la fenêtre qui compte : client servi, process mort, clé encore en vol, retry ré-exécuté ;
- retry après réponse perdue → **rejeu verbatim** (même statut, même corps, en-tête
  `idempotency-replayed: true`), aucune nouvelle release ;
- appel concurrent de même clé → 409 `ROLLBACK_IN_PROGRESS` — **un seul effet** ;
- clé différente → opération différente, non dédupliquée.

## P2 — snapshot statique orphelin

Les octets restaurés par le perdant restaient sur le volume RWX partagé. Non servis (la
garde statique n'ouvre qu'aux lignes `READY`) — mais « non servi » n'est pas « absent » :
un snapshot complet fuyait à **chaque** course perdue, sans que rien ne le collecte jamais.

**Correctif** — `removeStaticDeploymentSnapshot(rollback.id)` sur le chemin de refus, tant
qu'on tient encore l'id qui les possède ; l'échec de nettoyage est journalisé en `error`
plutôt qu'avalé.

## Preuves — [`red-without-fix.txt`](red-without-fix.txt) · [`green-with-fix.txt`](green-with-fix.txt) · [`postgres-idempotency.txt`](postgres-idempotency.txt)

Rouge obtenu en ramenant **`app.ts` seul** à l'état d'avant, spec inchangée :

```
 Tests  7 failed | 1 passed (8)

P0 stop 500          → expected 409 to be 500
P0 stop timeout      → expected 409 to be 500
P0 stop 200 mais actif → disappearance must actually be verified: expected 0 to be greater than 0
P0 arrêt réel        → expected 0 to be greater than 0        (le /status n'était jamais appelé)
P2 orphelin          → no directory may be left behind: expected […(3)] to deeply equal […(2)]
P1 rejeu             → expected undefined to be 'true'        (aucun en-tête de rejeu)
P1 concurrence       → exactly one rollback row may exist for one key: got 2
```

Le seul test vert en rouge est « une clé différente n'est pas dédupliquée » — normal, c'est
le comportement d'avant. Avec le correctif : **8/8**.

Sur **vrai Postgres**, quatre connexions **indépendantes** revendiquent la même clé au même
instant :

```
✓ (D) concurrent idempotency claims on separate connections: exactly one owner
      Tests  6 passed (6)
```

Un `Unique constraint failed on the fields: ("projectId", environment, key)` apparaît dans
la sortie : c'est le `P2002` attrapé, autrement dit la base qui arbitre — ce qu'un modèle en
mémoire ne peut pas établir.

## Régression

Suite `services/api` complète : **189 fichiers, 1640 tests, 0 échec** (1 skip).
`tsc` strict : **0 erreur**.

## Rejeu

```bash
# rouge/vert des trois réserves
BASELINE=origin/main bash -c 'git stash push -- services/api/src/app.ts && \
  (cd services/api && npx vitest --run --config vitest.config.ts \
     --pool=forks --poolOptions.forks.singleFork=true src/tests/rollback-refusal-hardening.spec.ts); \
  git stash pop'

# idempotence sur vrai Postgres
docker run -d --name vc-rollback-pgv -e POSTGRES_PASSWORD=vc -e POSTGRES_USER=vc \
  -e POSTGRES_DB=vibecore -p 55444:5432 pgvector/pgvector:pg16
DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore pnpm --filter @vibecore/database db:deploy
cd services/api && DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore \
  npx vitest --run --config vitest.config.ts --pool=forks --poolOptions.forks.singleFork=true \
  src/tests/rollback-concurrency-postgres.spec.ts
```

## Réserve honnête sur la portée

Les scénarios P0 sont prouvés avec un **manager stubé** (500 / timeout / « 200 mais toujours
présent »), pas contre un vrai workspace-manager en panne : provoquer un 500 réel du manager
demanderait de le casser volontairement sur le cluster de test, ce qui perturberait la
release partagée qui y tourne. Ce qui est exercé en réel, c'est le code de décision — quelle
réponse, quel état de ligne, quel log — pour chacun des quatre cas d'arrêt.
