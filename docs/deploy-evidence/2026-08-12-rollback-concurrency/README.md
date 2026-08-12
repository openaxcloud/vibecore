# Rollback — linéarisation de la chaîne (refus expert, 3e tour)

SHA refusé : `0fad8b7e` · branche `fix/deploy-rollback-integrity` · PR #94.
Rebasée sur `origin/main` (`6379a9fc`) — main ne contenait **rien** de ce lot.

## La réserve

> La sélection current/previous est faite AVANT la section sérialisée. Le verrou ne couvre
> que l'attribution de version. Donc 3 rollbacks concurrents peuvent TOUS restaurer v1 —
> résultat impossible dans un ordre séquentiel correct.

Exacte, et vérifiée dans le code : `listReleaseManifests` puis `selectPreviousRelease`
tournaient hors verrou, `withSerializedMutation` n'enveloppant que le calcul de
`nextVersion` au moment de l'append.

Le pire : l'ancien test `(b) deux rollbacks concurrents : versions monotones distinctes`
assertait exactement la propriété que le bug **préservait**. Il certifiait le défaut.

## Correctif — compare-and-set sur la tête du flux

La chaîne à linéariser est `sélection N-1 → restauration → manifeste → READY`. Elle n'est
**pas** enveloppée dans un verrou unique, et c'est délibéré :
`withSerializedMutation` tient un `pg_advisory_xact_lock` sur un pool **dédié de 5
connexions** (`prisma-store.ts`), et l'étape médiane du chemin serveur est un appel manager
borné à **200 s**. L'envelopper épinglerait une transaction plusieurs minutes et, avec la
moindre imbrication, épuiserait ce pool jusqu'au blocage (5 attentes + un porteur réclamant
une 2ᵉ connexion). C'est donc la **2ᵉ option autorisée par le refus** — refuser les
concurrents en 409 — implémentée comme un CAS :

| | |
|---|---|
| `releaseStreamLockKey(projectId, env)` | la clé unique du flux ; le chemin **publish** la prend via ce même helper, donc publish et rollback contendent par construction |
| sélection | lit la tête **sous ce verrou** → `supersededVersion` |
| `appendReleaseManifestAtHead` | sous le **même** verrou, n'écrit **que si** la tête vaut encore `expectedHeadVersion`, sinon `ReleaseHeadMovedError` et **rien** n'est écrit |

Conséquence : au plus **un** rollback commit contre une tête donnée. Tout concurrent —
rollback ou publish — est refusé `409 ROLLBACK_RELEASE_MOVED`, avec `expectedVersion` et
`observedVersion` dans la réponse. Un réessai voit la nouvelle tête et restaure **son**
N-1, ce qui est exactement le comportement séquentiel.

C'est la **même fonction** que pilotent les deux suites de concurrence — pas une
réimplémentation de test.

### Ce qu'un refus laisse derrière : rien

- **statique** — ligne `FAILED`, jamais `READY`. Les octets restaurés sont bien sur disque
  sous l'id du rollback, mais la garde de service statique n'ouvre qu'aux lignes `READY`
  (durcissement du même lot), donc ils ne sont jamais publiquement joignables.
- **serveur** — le CAS passe **avant** le flip READY. Obligatoire : la garde monotone
  interdit `READY→FAILED`, donc une ligne déjà promue ne pourrait plus être reprise alors
  que son Deployment k8s sert déjà une image N-1 périmée. Sur refus : `stopServerDeployment`
  puis ligne `FAILED` puis 409. Effet de bord positif — le manifeste devient durable
  **avant** READY, strictement plus fort que le seal-then-reflect du chemin publish.

## Preuves

### 1. Rouge sans le correctif — [`red-without-fix.txt`](red-without-fix.txt)

`app.ts` seul remis à l'état d'avant (le primitif reste importable), spec inchangée :

```
× three CONCURRENT rollbacks: exactly one commits, the others are refused 409
  → expected [ 201, 201, 201 ] to deeply equal [ 201, 409, 409 ]
× a publish that lands mid-rollback moves the head and the rollback refuses
  → expected 201 to be 409
✓ appendReleaseManifestAtHead refuses a stale head and writes nothing
✓ N concurrent appends from one head: exactly one wins, N-1 refused
      Tests  2 failed | 2 passed (4)
```

Les trois rollbacks commitent tous. La démarcation est nette : le primitif est correct, le
handler n'y était pas câblé.

### 2. PostgreSQL, les deux entrelacements — [`postgres-interleavings.txt`](postgres-interleavings.txt)

`PrismaApiStore` réel, table `ReleaseManifest` réelle, `pg_advisory_xact_lock` réel :

```
✓ (A) two rollbacks that selected the SAME head: one commits, one refused
✓ (A′) three CONCURRENT commits from one head on separate connections: exactly one wins
✓ (B) a publish commits while a rollback holds a stale head: the rollback is refused
✓ (A″) counter-proof: the pre-fix append lets three concurrent rollbacks all restore v1
✓ (C) rollback and publish serialise on one and the same stream lock key
      Tests  5 passed (5)
```

- **(A′)** trois connexions **indépendantes** — c'est ce qui prouve que l'advisory lock
  sérialise réellement, ce qu'un modèle en mémoire ne peut pas établir.
- **(C)** prouve que le verrou **bloque** effectivement (le second n'entre pas tant que le
  premier tient), au lieu de le supposer.
- **(A″)** le contre-exemple : l'algorithme d'avant rejoué sur la **même** base rend
  `restored === [1, 1, 1]` — la réserve reproduite au niveau du stockage.

### 3. Rollback LIVE — [`live-rollback.txt`](live-rollback.txt)

Processus serveur API réel, Postgres réel, HTTP réel, octets réels.

```
BEFORE  GET /static-deployments/dep_live_2_.../index.html   200
  content = "<h1>RELEASE-V2-CURRENT-CONTENT</h1>"
  sha256  = sha256:5545e9ae…7d3d

ROLLBACK  POST /projects/:id/deployments/rollback-to-previous   201
  restoredFromVersion    = 1
  verifiedArtifactDigest = sha256:34083315…72f0
  restoredArtifactDigest = sha256:34083315…72f0     ← identiques
  rollbackable           = true

AFTER   GET /static-deployments/<restored>/index.html          200
  content = "<h1>RELEASE-V1-ORIGINAL-CONTENT</h1>"
  sha256  = sha256:a06d31c2…637f
  content CHANGED: true
```

`verifiedArtifactDigest == restoredArtifactDigest` : les octets re-matérialisés sont
byte-identiques à ce que le manifeste de v1 avait enregistré.

L'historique final lit l'échelle de rollback en clair — v3 porte l'empreinte de v1, v4
celle de v2, v5 celle de v1 :

```
v5  digest=sha256:34083315…72f0   (= v1)
v4  digest=sha256:f9ffdb5b…5c1a   (= v2)
v3  digest=sha256:34083315…72f0   (= v1)
v2  digest=sha256:f9ffdb5b…5c1a
v1  digest=sha256:34083315…72f0
```

Et la concurrence en live :

```
#0: status=201  restoredFrom=2
#1: status=409  code=ROLLBACK_RELEASE_MOVED  expected=3 observed=4
#2: status=201  restoredFrom=3
  restored versions among commits: [2,3]
  all distinct (serial-equivalent): true
```

Deux commits, mais restaurant des releases **distinctes** (v2 puis v3) : c'est le
comportement séquentiel correct pour des requêtes qui se sérialisent réellement. L'invariant
vérifié en live est donc l'équivalence sérielle — *aucun* couple de commits ne restaure la
même release — et non un quota fixe de 409, qui dépendrait du timing.

Rejouable :

```bash
# atomicité READY↔manifeste — rouge (parent) puis vert (HEAD)
bash scripts/prove-rollback-ready-atomicity.sh

# suites de concurrence (les tests PG se skippent sans DATABASE_URL)
docker run -d --name vc-rollback-pgv -e POSTGRES_PASSWORD=vc -e POSTGRES_USER=vc \
  -e POSTGRES_DB=vibecore -p 55444:5432 pgvector/pgvector:pg16
DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore pnpm --filter @vibecore/database db:deploy
cd services/api && DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore \
  npx vitest --run --config vitest.config.ts --pool=forks --poolOptions.forks.singleFork=true \
  src/tests/rollback-concurrency-postgres.spec.ts src/tests/rollback-concurrency-linearization.spec.ts

# rollback live avec VRAI build (serveur + Postgres + HTTP réels)
DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore npx tsx scripts/prove-rollback-live-realbuild.mts

# variante à releases semées (serveur externe déjà lancé)
API_PORT=3199 API_HOST=127.0.0.1 DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore \
  STATIC_DEPLOY_STORAGE_DIR=/tmp/live-static AUTH_JWT_SECRET="$(openssl rand -hex 24)" \
  npx tsx services/api/src/server.ts &
API_BASE=http://127.0.0.1:3199 DATABASE_URL=postgresql://vc:vc@127.0.0.1:55444/vibecore \
  STATIC_DEPLOY_STORAGE_DIR=/tmp/live-static npx tsx scripts/prove-rollback-live.mjs
```

### 4. Rollback LIVE avec VRAI PUBLISH — [`live-rollback-realbuild.txt`](live-rollback-realbuild.txt)

La preuve précédente **semait** les deux releases initiales. Celle-ci ferme l'écart : elle
pilote le vrai endpoint de publish avec le **vrai build** (`runStaticBuild`), donc un
`npm run build` s'exécute réellement et produit les octets ensuite snapshotés, digérés,
manifestés et servis.

```
1. PUBLISH v1 — REAL build
   build log : ["Static deploy: building in …/projects/cmsq0os43001nvylnsshxl98g",
                "[build] built 2026-08-12T11:39:54.825Z",
                "Static deploy: snapshot stored at …/static/cmsq0osz9001rvyln9b53wahc"]
   deployment : cmsq0osz9001rvyln9b53wahc READY
2. PUBLISH v2 — REAL build, source différente          → READY
   v2 digest=sha256:f9ffdb5b…5c1a   v1 digest=sha256:34083315…72f0

3. BEFORE  "RELEASE-V2-CURRENT-CONTENT"   sha256:5545e9ae…7d3d
4. ROLLBACK 201  verified == restored == sha256:34083315…72f0   rollbackable=true
5. AFTER   "RELEASE-V1-ORIGINAL-CONTENT"  sha256:a06d31c2…637f   changed=true

6. #0 201 restoredFrom=2 | #1 409 ROLLBACK_RELEASE_MOVED expected=4 observed=5 | #2 201 restoredFrom=3
   restored versions among commits: [2,3]   all distinct: true

LIVE ROLLBACK (REAL BUILD) PROVEN
```

Corroboration utile : les empreintes obtenues par le **vrai build** (`34083315…72f0` pour
le contenu V1, `f9ffdb5b…5c1a` pour V2) sont **identiques** à celles de la run semée — les
deux chemins produisent bien le même artefact.

Seul écart restant avec la prod : le build tourne dans le processus API plutôt que dans un
pod workspace (`staticBuildRunner` / `useWorkspacePodBuild` sont les options de
l'application elle-même, et le chemin de code après le retour du build est identique).

## État CI au SHA — un seul échec était le nôtre, il est corrigé

| Check | Cause | À nous ? |
|---|---|---|
| `Secret scan (gitleaks, blocking)` | littéral `AUTH_JWT_SECRET=…` dans les instructions de rejeu de ce README | **oui → corrigé, CI verte confirmée au SHA `8f6fcd89`** |
| `Install, test, build, scan` | lint `app/root.tsx:36` `@blitz/lines-around-comment` | non — fichier **byte-identique à main** (`git rev-parse HEAD:app/root.tsx == origin/main:app/root.tsx`), absent de notre diff |
| `Quality Gates` | attend le check ci-dessus | non — conséquence |
| `Playwright` ×4 / `French i18n live audit` | balises OG/Twitter manquantes sur les pages marketing du site **live** (`i18n-french-live.spec.ts`) | non — front marketing, aucun rapport avec un changement backend `services/api` |

Correction gitleaks : le secret de dev n'est plus un littéral, il est **généré**
(`randomBytes` dans le script, `$(openssl rand -hex 24)` dans la doc). Pas d'entrée ajoutée
à `.gitleaksignore` — supprimer la cause vaut mieux que faire taire un scanner dont le
travail est justement d'être bruyant sur les littéraux. Après correction :
`gitleaks` → **0 finding dans les fichiers de ce lot** (les 5 restants sont des archives de
preuve antérieures, déjà couvertes).

⚠️ **`app/root.tsx` bloque la CI de tout le monde**, pas seulement cette PR. Corrigeable en
`eslint --fix`, mais délibérément **non corrigé ici** : ajouter un fichier sans rapport au
diff d'un lot sensible compliquerait le contre-audit. À traiter séparément.

### 5. Rollback LIVE sur le CLUSTER DE TEST DÉDIÉ — [`live-rollback-cluster.txt`](live-rollback-cluster.txt)

Branche déployée sur une release **isolée** du cluster d'audit, image API construite depuis
le SHA du lot. Ni la prod ni la release partagée ne sont touchées :

| | mien | partagé (intact) |
|---|---|---|
| cluster | `vibecore-audit-cluster` — projet **`vibecore-audit-test-20260807`** (≠ prod `vibecore-495216`) | |
| release / ns | `vibecore-rbaudit` / `vibecore-rbaudit` | `vibecore` / `vibecore` |
| runtime ns | `workspaces-rbaudit` | `workspaces` |
| base | `vibecore_rbaudit` | `vibecore` |
| Redis | `rbaudit-redis` (in-ns) | `vibecore-redis` |
| image API | **`api:ab8e02bde8`** (SHA du lot) | `api:82603d55f7` |

**Contenu et empreinte, avant / après** — octets lus sur le VRAI PVC RWX du cluster :

```
v2 (AVANT)              "RELEASE-V2-CURRENT-CONTENT"    sha256:5545e9ae…7d3d
v3 (APRÈS le rollback)  "RELEASE-V1-ORIGINAL-CONTENT"   sha256:a06d31c2…637f   ← identique à v1
v1 (source)             "RELEASE-V1-ORIGINAL-CONTENT"   sha256:a06d31c2…637f
```

Réponse du vrai endpoint : `201`, `restoredFromVersion=1`, `supersededVersion=2`,
`verifiedArtifactDigest == restoredArtifactDigest == sha256:34083315…72f0`. Et la table
`ReleaseManifest` de la vraie base porte l'échelle : `v3` a l'empreinte de `v1`.

**Concurrence, sur le cluster, avec de vrais `pg_advisory_xact_lock`** :

```
#0 201 restoredFrom=2 | #1 409 ROLLBACK_RELEASE_MOVED expected=3 observed=4
                      | #2 409 ROLLBACK_RELEASE_MOVED expected=3 observed=4
commits=1 refus=2  → équivalence sérielle: true
```

#### Portée déclarée, sans enjoliver

Les deux releases initiales ont été **matérialisées** (octets sur le PVC + lignes en base),
pas produites par un build en pod workspace. Le chemin de publish a bien démarré — pod
gVisor `Running`, sources écrites, worker consommant BullMQ, build lancé — mais échoue à
l'`npm install` : les fichiers écrits ne survivent pas au pod qui exécute le build dans cet
environnement éphémère. C'est du cycle de vie workspace, **hors du lot Rollback**, et je ne
l'ai pas maquillé en succès.

Ce qui est SOUS AUDIT s'exécute en réel : sélection N-1, vérification d'empreinte,
restauration des octets, compare-and-set, flip READY, écriture du manifeste, refus 409 des
concurrents. Le chemin de publish avec **vrai `npm run build`** est prouvé séparément
(§4) et produit **exactement les mêmes empreintes**.

#### Trois défauts d'infrastructure trouvés en montant l'environnement

Aucun ne vient du lot, tous méritent une fiche :

1. **Install à neuf impossible** — le hook `pre-install` de migration référence le
   ServiceAccount de l'API, créé seulement APRÈS les hooks :
   `error looking up service account …-api: not found`. Un `helm install` du chart dans un
   namespace neuf ne peut pas réussir. Contourné en pré-créant le SA.
2. **URLs figées sur la release partagée** — `workspaceManagerUrl` et `API_BASE_URL`/
   `SAAS_API_URL` pointent en dur sur `…vibecore.svc`. Une seconde release pilote donc le
   workspace-manager et l'API des AUTRES. Ici la NetworkPolicy a tenu (502 / `fetch failed`),
   mais l'isolation reposait sur un garde-fou réseau, pas sur la configuration.
3. **DNS bloqué par la NetworkPolicy** — la règle DNS vise `namespaceSelector: kube-system`
   alors que la résolution passe par la ClusterIP `10.30.0.10` ; il faut une policy
   `allow-dns-clusterip`. Le namespace partagé en avait une, ajoutée à la main 10 h plus tôt
   — donc quelqu'un d'autre a déjà heurté le même mur.

## Ce qui reste à faire

**Un rollback live en PRODUCTION.** Il exigerait de déployer une branche non mergée d'un
lot sensible sur la prod : c'est la décision d'Avi, pas la mienne.

## Suites

- rollback : **77/77** (10 fichiers, Postgres inclus)
- `tsc` strict `services/api` : **0 erreur** (les 27 erreurs signalées au tour précédent
  étaient des artefacts de résolution du worktree ; elles disparaissent après rebase)
