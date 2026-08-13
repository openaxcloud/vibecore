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
 Tests  11 failed | 1 passed (12)

P0 stop 500            → the strict stop must have been attempted: expected 0 to be greater than 0
P0 stop timeout        → expected 201 to be 500
P0 stop CRASH (socket) → expected 0 to be greater than 0
P0 constat injoignable → expected 0 to be greater than 0
P0 stop 200 mais actif → disappearance must actually be verified: expected 0 to be greater than 0
P0 arrêt réel          → expected 0 to be greater than 0
P2 orphelin            → expected 201 to be 409
P1 rejeu               → expected undefined to be 'true'   (aucun en-tête de rejeu)
P1 concurrence         → exactly one rollback row may exist for one key: got 2
```

Le seul test vert en rouge est « une clé différente n'est pas dédupliquée » — normal, c'est
le comportement d'avant. Avec le correctif : **12/12**.

Les quatre cas d'arrêt exigés sont couverts, plus un cinquième que la réserve implique sans
le nommer :

| cas | comportement attendu |
|---|---|
| `/stop` → **500** | incident, 500 `ROLLBACK_STALE_WORKLOAD_ACTIVE` |
| `/stop` → **timeout** | idem |
| `/stop` → **crash** (socket coupé, aucun statut HTTP) | idem |
| `/stop` → 200 **mais le workload est encore là** | idem — un 200 n'est pas une preuve |
| **le constat lui-même est injoignable** | idem — « je n'ai pas pu vérifier » n'est pas « c'est parti » |
| `/stop` → 200 **et disparition constatée** | refus normal : 409 + ligne `FAILED` |

Le cas « constat injoignable » est la moitié subtile de la réserve :
`getServerDeploymentStatusViaManager` avale ses propres erreurs et renvoie `undefined`, donc
un contrôle naïf lirait ça comme « aucun workload trouvé » et déclarerait victoire — le même
fail-open, un cran plus bas que celui qui était signalé.

Sur **vrai Postgres**, quatre connexions **indépendantes** revendiquent la même clé au même
instant :

```
✓ (D) concurrent idempotency claims on separate connections: exactly one owner
      Tests  6 passed (6)
```

Un `Unique constraint failed on the fields: ("projectId", environment, key)` apparaît dans
la sortie : c'est le `P2002` attrapé, autrement dit la base qui arbitre — ce qu'un modèle en
mémoire ne peut pas établir.

## Trois trous des mêmes classes, trouvés en relisant mon propre correctif

| trou | conséquence | correctif |
|---|---|---|
| `releaseRollbackIdempotency` déclaré mais **jamais appelé** | une clé laissée `IN_FLIGHT` par un process mort en plein vol restait bloquée **à jamais** — aucun TTL, ce couple projet+clé devenait inutilisable | reprise d'une revendication abandonnée au-delà de 15 min (fenêtre très large devant la borne de 200 s du manager, donc une exécution vivante n'est jamais volée) |
| un **5xx devenait la réponse rejouée** | chaque retry se voyait resservir le même incident sans jamais retenter : échec rendu permanent | `onSend` libère la revendication sur 5xx ; seuls les résultats délibérés (2xx/4xx) sont rejoués |
| deux autres branches de refus statique laissaient l'orphelin | dont `ROLLBACK_DEST_DIGEST_FAILED`, où la restauration a **réussi** (snapshot complet) et seul le digest a échoué — le plus gros orphelin des trois branches | balayage sur les trois branches |

## Deux erreurs de méthode, corrigées

**Un test devinait le format de clé interne d'une Map** au lieu de passer par une seam
explicite : il écrivait donc un enregistrement malformé (sans `state`) au lieu d'échouer, et
le takeover ne se déclenchait jamais. `TestApiStore` expose désormais `backdateRollbackIdempotency`
et `peekRollbackIdempotency`.

**Un test P2 « digest » a été RETIRÉ plutôt que rafistolé** : il faisait du `vi.spyOn` sur un
module ESM, son `mockRestore` fuyait et cassait les deux tests suivants sous parallélisme. Un
test fragile qui casse ses voisins est exactement ce qui est reproché ailleurs dans ce lot. Le
correctif de cette branche reste ; sa couverture automatisée, non — dit plutôt que masqué.

## Le même fail-open P0 était encore sur DEUX autres chemins

La réserve nommait le perdant du CAS. Le même helper best-effort restait utilisé ailleurs,
avec la même conséquence — la base affirme une chose, le cluster en fait une autre :

| chemin | ce que le code PROMETTAIT | ce qui se passait |
|---|---|---|
| **annulation** | « must tear it down so it doesn't keep serving » | un 500 du manager laissait la ligne `CANCELED` pendant que le workload **continuait de servir** |
| **timeout stale** | « tear them down so nothing leaks » | ligne `FAILED` quoi qu'il arrive, alors que le commentaire note lui-même qu'un pod Pending relance l'autoscaler indéfiniment |

La mitigation invoquée à l'annulation (« le manager GC les orphelins ») est exactement le
« quelqu'un d'autre nettoiera » que la réserve rejette : elle n'est pas constatée ici, donc
elle ne peut pas être affirmée ici.

Dans les deux cas le verdict terminal reste juste — l'utilisateur a annulé, le build a
vraiment expiré. Ce qui ne peut pas rester, c'est d'affirmer en silence que le workload a
disparu : l'arrêt strict est tenté, et un démontage non prouvé est **enregistré**
(`staleWorkloadActive` + cause + log `error`) et, pour l'annulation, **renvoyé à l'appelant**.

Rouge **13/14** contre l'avant-lot, vert **14/14**.

## Régression

Suite `services/api` : **188 fichiers, 1523 tests, 0 échec** (1 skip ; `api.spec.ts` exclu — modifié dans ce worktree par une autre session).
`tsc` strict : **0 erreur**.

### Deux erreurs de type que la CI ne pouvait pas montrer

En repassant `tsc -p tsconfig.json` pour ce lot, deux erreurs sont sorties dans **mon propre**
fichier de spec : `losingServerRollback` déclarait `SerializingStore` alors qu'il utilise les
seams du sous-classe `PausingSerializingStore`. Elles étaient masquées **deux fois** :

1. `pnpm build` compile depuis `src/server.ts` et suit les imports — il ne typecheck donc
   jamais les specs ;
2. en CI, le step `Typecheck` était **`skipped`** : la garde i18n échouait avant lui. Et le
   typecheck racine s'arrête au *web app* (2 erreurs héritées dans `app/root.tsx` et
   `app/utils/shell.ts`, hors de ce lot), sans jamais atteindre `services/api`.

Signature corrigée en `PausingSerializingStore` ; `tsc -p tsconfig.json` repasse à **0**.
Un « tsc strict 0 » rapporté plus tôt dans ce lot mesurait le build, pas les specs.

### Aucune suite laissée non exécutée

Une régression sans `DATABASE_URL` **saute 7 fichiers** — silencieusement, en affichant
« passed ». Dont `rollback-concurrency-postgres.spec.ts`, c'est-à-dire la preuve P1 elle-même.
Un vert obtenu ainsi ne prouve pas ce qu'il a l'air de prouver.

Les 7 ont donc été rejouées sur un vrai Postgres au SHA courant :

| suite | résultat |
|---|---|
| `rollback-concurrency-postgres` (la mienne) | **6/6** — dont (A″) contre-exemple et (D) avec trois `Unique constraint failed` |
| `prisma-store`, `ledger-store-db`, `connector-store`, `connector-isolation`, `mcp-marketplace` | **45/45** |
| `agent-memory-pgvector` (variable dédiée `AGENT_MEMORY_PGVECTOR_TEST_DATABASE_URL`) | **1/1** |

Les six dernières sont hors lot, mais ce lot **ajoute un modèle au schéma Prisma**
(`RollbackIdempotency`) : les exécuter est la seule façon de montrer que l'ajout ne régresse
pas les magasins existants.

## Rejeu

```bash
# rouge/vert des trois réserves.
#
# ⚠️ NE PAS utiliser `git stash push -- <fichier>` ici : sur un fichier COMMITÉ et non
# modifié il ne remise rien, le correctif n'est jamais retiré, et le « rouge » ressort
# vert 10/10 en donnant l'illusion d'une preuve. Ramener explicitement à l'avant-lot :
git checkout origin/main -- services/api/src/app.ts
(cd services/api && npx vitest --run --config vitest.config.ts \
   --pool=forks --poolOptions.forks.singleFork=true src/tests/rollback-refusal-hardening.spec.ts)
git checkout HEAD -- services/api/src/app.ts   # restaurer le correctif

# idempotence sur vrai Postgres
docker run -d --name vc-rollback-pgv -e POSTGRES_PASSWORD=vc -e POSTGRES_USER=vc \
  -e POSTGRES_DB=vibecore -p 55444:5432 pgvector/pgvector:pg16
DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore pnpm --filter @vibecore/database db:deploy
cd services/api && DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore \
  npx vitest --run --config vitest.config.ts --pool=forks --poolOptions.forks.singleFork=true \
  src/tests/rollback-concurrency-postgres.spec.ts
```

## La réserve de portée, refermée : les mêmes cas contre un VRAI socket

La version précédente de ce document s'arrêtait à « scénarios P0 prouvés avec un manager
**stubé** ». Le trou n'était pas le manager : c'était que les tests remplacent
`globalThis.fetch` et **fabriquent** les pannes qu'ils jugent — un `TimeoutError` fait main,
un `TypeError{cause.code:'ECONNRESET'}` fait main. Ces formes sont une hypothèse sur ce que
produit undici, assertée nulle part.

Cinq tests supplémentaires gardent donc le **vrai** client et pointent `WORKSPACE_MANAGER_URL`
sur un vrai serveur `node:http` qui se comporte mal. Aucun cluster requis :

| cas sur le fil | ce que ça prouve en plus du stub |
|---|---|
| **500 réel** | un `Response` non-OK réel pilote bien `response.ok === false` |
| **socket détruit** (`req.destroy()`) | une erreur réseau réelle **remonte en throw**, pas en `undefined` silencieux — c'est exactement le fail-open sous audit |
| **sonde `/status` en 500 réel** | « je n'ai pas pu vérifier » reste distinct de « c'est parti », sur du vrai HTTP |
| **200 réel + JSON réel `exists:false`** | le chemin de parsing nominal → refus 409 normal |
| **le serveur ACCEPTE puis ne répond JAMAIS** | celui qu'un stub ne peut structurellement pas produire |

Le dernier est le plus important. Le stub lève **instantanément** : il ne dit rien d'un
manager muet. Or l'appel tourne pendant que le rollback tient sa section sérialisée — si
`AbortSignal.timeout(30_000)` ne se déclenchait pas, la requête épinglerait le verrou
advisory au lieu d'échouer proprement. Mesuré : **30 402 ms**, donc l'abort tire réellement.
Le test encadre des deux côtés (`> 25 s` : il a bien attendu l'abort et n'a pas échoué plus
tôt pour une autre raison ; `< 70 s` : il ne pend pas).

Rouge obtenu contre `cf002d9c` — la base **chirurgicale** : CAS déjà présent, arrêt strict
pas encore. Les messages sont littéralement la réserve :

```
500 réel          → expected 409 to be 500     (un 409 PROPRE pendant que le manager explose)
socket détruit    → expected 409 to be 500
manager muet      → expected 409 to be 500     en 30 438 ms : il attendait l'abort… puis l'avalait
sonde /status 500 → calls.status = 0           la disparition n'était jamais constatée
200 + gone        → calls.status = 0
```

Un premier rouge pris contre le point de divergence donnait `calls.stop = 0` sur les cinq :
juste, mais c'est le rouge du **lot entier** (le CAS n'existe pas encore), pas celui de la
réserve P0. D'où la base chirurgicale ci-dessus.

Suite : **19/19**.

### Ce qui reste hors de portée, dit franchement

Le workspace-manager n'est pas un vrai manager Kubernetes en panne : c'est un vrai serveur
HTTP qui produit de vraies pannes de transport. Ce qui n'est donc toujours pas couvert, c'est
un manager qui répondrait `200` **en mentant** sur l'état réel du cluster — le cas
« `exists:false` alors que le pod tourne encore ». Ce mensonge-là ne peut être démenti que
par le cluster lui-même, pas par le client.
