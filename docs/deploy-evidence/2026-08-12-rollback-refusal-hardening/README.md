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
2. en CI, le step `Typecheck` était **`skipped`** — la garde i18n échouait avant lui — donc
   la CI n'a jamais eu l'occasion de les montrer.

Signature corrigée en `PausingSerializingStore` ; `tsc -p tsconfig.json` repasse à **0**.
Un « tsc strict 0 » rapporté plus tôt dans ce lot mesurait le build, pas les specs.

Précision pour qui rejouerait : lancé ici, le typecheck **racine** s'arrête au *web app* sur
deux erreurs de résolution (`app/root.tsx`, `app/utils/shell.ts`) et n'atteint jamais
`services/api`. Ces deux fichiers sont hors de ce lot et inchangés par lui. Ce sont
**vraisemblablement des artefacts de worktree** — `node_modules` y est un lien vers le
checkout principal, et `@vibecore/editor/install-pwa-sw` n'y résout pas — et non un
diagnostic sur la CI : le step CI correspondant n'ayant jamais tourné, on ne peut rien en
affirmer. D'où le `tsc` exécuté **au niveau `services/api`**, seul périmètre de ce lot.

## P1 manquait une route : `POST /deployments/:id/rollback`

La réserve visait `rollback-to-previous`. Mais la route sœur **crée elle aussi une ligne de
déploiement à chaque appel**, et ne portait **aucune** idempotence — le même « un retry n'est
pas un retry ».

La conséquence n'est pas identique, et il serait malhonnête de lui emprunter la gravité de
l'autre : `rollback-to-previous` choisit le N-1 **relativement à la tête**, donc un rejeu
**oscille** (v1 → v2 → v1). Ici la cible est un **id explicite**, donc un rejeu re-vise la
même release — pas d'oscillation. Ce qu'il produit, c'est une **ligne de rollback dupliquée**
pour une seule intention, et le quota `deployments.count` consommé pour elle.

Rouge d'abord, correctif ensuite : `expected undefined to be 'true'` — aucun en-tête
`idempotency-replayed`, la route n'avait rien. Vert après : rejeu verbatim, **une seule**
ligne pour une clé, et une clé différente reste une opération différente.

### Un refactor tenté, puis ANNULÉ — et pourquoi

Première tentative : factoriser la revendication et le hook `onSend` en helpers partagés par
les deux routes, pour ne pas dupliquer une règle de correction. **Elle a cassé la route
auditée**, et le rouge était franc — deux appels concurrents de même clé :

```
DBG-CLAIM key-concurrent owned=true            ← une seule revendication possédée : OK
DBG-CLAIM key-concurrent owned=false IN_FLIGHT
DBG-APPEND expected=2 rollbackId=…u64          ← mais DEUX appends,
DBG-APPEND expected=2 rollbackId=…u64             avec deux rollbackId DIFFÉRENTS
→ 409 ROLLBACK_RELEASE_MOVED (expected head v2, found v3)
```

Le CAS refusait le rollback… déclenché par la requête elle-même. Le même relevé sur la base
d'avant refactor donne **1 seul append** et un 201. Déterministe des deux côtés (HEAD 3/3
vert, refactor 3/3 rouge) — donc bien causal, pas un test instable.

Le correctif retenu **laisse `rollback-to-previous` intacte à l'octet près** (les trois hunks
du diff `app.ts` sont tous après la ligne 35562 ; la route auditée occupe 34776→~35560) et
donne à la route sœur sa propre copie. La duplication est assumée et commentée dans le code :
déstabiliser un chemin déjà prouvé et sous audit expert pour supprimer une redondance est le
mauvais arbitrage.

Suite de durcissement : **20/20**.

### La même route passée aux DEUX autres classes — et elle est saine

Avoir trouvé P1 ici obligeait à demander si P0 et P2 y étaient aussi. Vérifié, la réponse est
non, et pour des raisons précises plutôt que par absence de preuve du contraire :

| classe | verdict sur la route sœur |
|---|---|
| **P0** (workload obsolète laissé actif) | **sans objet.** Les deux refus (`ROLLBACK_NO_RETAINED_DIGEST`, `ROLLBACK_SECRET_POLICY_UNSATISFIABLE`) sont levés **avant** tout appel au manager : aucun workload n'existe. Si la convergence échoue, la ligne reste `BUILDING` — pas un `FAILED` menteur — et le reconciler de lecture la reprend. Si l'écriture du manifeste échoue **après** READY, le workload sert réellement et la ligne le dit ; le sceau a déjà posé `rollbackable:false` + `manifest_pending`, donc c'est le dispositif d'atomicité de la 1ʳᵉ réserve qui prend le relais. |
| **P2** (snapshot orphelin) | **sans objet.** Le rollback statique y est créé READY d'emblée en recopiant l'URL/metadata de la CIBLE, sans matérialiser de snapshot sous son propre id — il n'y a donc aucun octet à orpheliner. |
| **P1** (idempotence) | la seule qui s'appliquait. Corrigée ci-dessus. |

### Relecture de ma propre 0084 : la table échappait à la suppression de projet

En relisant la migration que ce lot ajoute, `projectId` y était une simple colonne `TEXT`,
**sans clé étrangère** — alors que toutes les tables voisines portent
`@relation(..., onDelete: Cascade)`. À la suppression d'un projet, ces lignes **survivaient**,
orphelines, en conservant `responseBody` : la charge utile complète du déploiement. Le dépôt
mène par ailleurs un chantier explicite de purge/scrub ; y ajouter une table qui échappe à la
purge irait contre celui-ci.

Prouvé sur vrai Postgres, dans les deux sens :

```
AVEC la 0085  : 1 ligne avant la suppression du projet → 0 après
SANS la 0085  : 1 ligne SURVIT, avec sa charge intacte
                {"deployment": {"url": "https://secret.example"}}
```

Migration séparée (`0085`) plutôt que modification de la `0084` : celle-ci a déjà été
appliquée sur des bases locales et sur le cluster de test, donc en changer le contenu
modifierait son checksum et ferait échouer `prisma migrate deploy` sur une dérive. Sûr à
appliquer : la table appartient à ce lot non mergé, elle est vide partout, aucune ligne
orpheline ne peut faire échouer la création de la contrainte.

`deploymentId` reste volontairement **sans** clé étrangère : la trace du rejeu doit survivre
à la suppression du déploiement cité — sinon un retry après purge redeviendrait un **vrai**
rollback, ce que P1 existe précisément pour empêcher.

**À signaler, hors périmètre :** `ReleaseManifest` (lot antérieur, migration `0082`) a la
même absence de cascade. Ce n'est donc pas une régression que ce lot introduit par rapport
aux conventions du domaine — mais c'est un vrai manque, et il reste ouvert. Il n'est pas
corrigé ici : cette table **contient des lignes en production**, donc l'ajout d'une clé
étrangère peut échouer sur des orphelins préexistants et demande son propre inventaire.

## Le rouge de CI n'appartient pas à ce lot — démontré, pas affirmé

`Production CI` est rouge sur cette PR. Dire « c'est hérité » ne vaut rien sans preuve, d'autant
que ce lot a RÉELLEMENT cassé cette même garde plus tôt (5 codes-raison non allowlistés, voir
plus haut) — donc le soupçon est légitime.

Vérifié sur le **vrai commit de merge de la PR** (`refs/pull/94/merge`, `9e28349e`), dans un
worktree jetable, avec le scanner exact de la CI :

```
tel quel                        → residual=15 en 3 fichiers, allowlisted=771
                                  Hardcoded-copy baseline regressions:
                                  - services/api/src/database-provisioner.ts (baseline=0, current=1)   → exit 1

database-provisioner ramené     → residual=14 en 2 fichiers, allowlisted=771
à sa version d'avant-dette        i18n source baseline clean (5 file improvements)                     → exit 0
```

Seul ce fichier change de main ; il n'est **pas** touché par ce lot (`git diff --stat
origin/main...HEAD -- services/api/src/database-provisioner.ts` est vide). Et `allowlisted`
reste à **771** dans les deux cas, ce qui prouve que les 5 entrées de ce lot sont bien actives
et comptées : le scan est le vrai, pas un scan dégradé.

⚠️ **Première tentative INVALIDE, gardée ici comme avertissement.** Un `git show "$BASE:chemin"`
mal quoté a échoué en laissant la redirection créer un fichier **VIDE** — qui n'a évidemment
aucun résidu. Le « baseline clean » obtenu ainsi ne prouvait rien. Le signal qui trahit :
`allowlisted` était tombé à **767**, le fichier vidé ayant emporté ses propres entrées. Refaite
avec le fichier réel (30 922 octets), la conclusion tient.

### Le 429 de quota était figé — corrigé (après avoir failli le laisser)

`onSend` ne relâche la revendication que sur **5xx** ; tout 2xx/4xx délibéré devient la réponse
rejouée. Or `ensureQuota` lève `statusCode: 429 / QUOTA_EXCEEDED`, et les **deux** routes
l'appellent après la revendication (`rollback-to-previous` deux fois, la sœur une). Un rollback
refusé pour quota fige donc un **429 pour toujours** sur cette clé : quota libéré ou plan
relevé, le même retry ressortira le 429 d'origine, sans jamais retenter. Il n'y a par ailleurs
**aucune expiration de clé** dans cette table.

**J'ai d'abord décidé de ne PAS le corriger**, au motif que cela touchait le `onSend` de la
route auditée à la veille d'une re-revue, et qu'un refactor de cette même zone avait déjà
cassé la route une fois. Cette prudence était mal calibrée, pour deux raisons :

- le refactor qui avait cassé la route était un **déplacement structurel** du flot de
  contrôle ; ici il s'agit d'**une condition**, sans rien déplacer. Les profils de risque
  n'ont rien de comparable ;
- l'argument « Stripe fige les 4xx » vaut pour un **résultat métier délibéré** (carte
  refusée). Un 429 n'en est pas un : il dit explicitement « réessayez plus tard ». Et Stripe
  **expire** ses clés à 24 h, ce que cette table ne fait pas.

Relâcher est par ailleurs strictement plus sûr : une ré-exécution reste gouvernée par le
quota même qui l'a produite, donc rien ne peut passer en force.

Corrigé sur les **deux** routes (`reply.statusCode >= 500 || reply.statusCode === 429`),
prouvé rouge→vert :

```
sans le correctif → a 429 must not become the pinned answer: expected 'true' to be undefined
                    (le retry recevait bien `idempotency-replayed: true`, donc le 429 figé)
avec              → 21/21
```

Le test tient le scénario complet : quota à 0 → 429, quota restauré → **le même clé exécute
réellement** (201, sans en-tête de rejeu).

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
