# P0-V3-09 — checkpoint : claim redescendu au prouvé + restore réel

Date : 2026-08-03 · Branche : `feat/p0-v3-09-checkpoint-restore` · Contrat :
[`CHECKPOINT_CONTRACT`](../../parity/CHECKPOINT_CONTRACT.md) v3

**Statut : OPEN.** Ce lot corrige le claim et ajoute la preuve de restore ; il ne
clôt pas le point. La couverture BASE et le gel des écrivains in-pod ne sont pas
prouvés — clôture sur signature expert uniquement.

## Le refus auquel ce lot répond

> « barrière 2 phases prouvée mais pas le niveau *transaction-consistent*
> revendiqué » — `P0_REGISTRY.yaml`, `refusalType: DESACCORD`

## Ce qui a été trouvé en auditant l'existant

Trois défauts, au-delà du niveau annoncé :

1. **La barrière ne gelait rien en prod.** Elle vivait dans une `Map` de
   processus, alors que l'API tourne en **2 replicas** (HPA → 6,
   `values-prod.yaml`). Une écriture routée vers un autre replica ne voyait
   aucune barrière. → bail persisté en base (`ProjectCheckpoint.barrierExpiresAt`),
   lu par tous les replicas ; l'expiration reste le dégel garanti.
2. **La barrière couvrait 2 routes sur ~35** qui mutent l'arbre projet — et
   plusieurs écritures partent de handlers **GET**
   (`listProjectFilesIncludingIdeState` resynchronise via
   `restoreSnapshot`/`writeFiles`). → garde déplacé au **point d'étranglement du
   stockage** (`checkpoint-barrier-storage.ts`) : tout appelant du processus API
   la rencontre, qu'il y ait pensé ou non.
3. **Le composant BASE était marqué `verified: true` sans vérification.**
   `takeSnapshot` rend la main dès que le CR `Backup` est accepté — il n'attend
   ni la fin ni la restaurabilité. → exclu des composants vérifiés, consigné en
   `bestEffortComponents`, base laissée en `dependenciesDeclared`.

## Niveau de cohérence — déclaré exact

`crash-consistent`, dérivé (jamais écrit à la main) par
`checkpoint-consistency.ts` depuis la portée réelle de la barrière. Le manifeste
porte `notClaimed: [application-consistent, transaction-consistent]` et
`crossComponentAtomic: false` (les composants sont snapshottés en séquence :
partager un `logicalBarrierId` ordonne les étapes, ça ne crée pas un instant
atomique).

`checkpoint-consistency.spec.ts` échoue si un niveau interdit apparaît dans un
manifeste sérialisé — la sur-revendication est une erreur de CI, plus un point de
revue.

Limite structurelle écrite dans le manifeste : le checkpoint capture l'arbre
**côté API** (Filestore RWX), **pas** le volume vif du pod
(`pvc-<workspaceId>`). Les deux ne convergent que sur autosave navigateur.

## Preuve de restore réelle

`checkpoint-restore-proof.spec.ts` — le cycle demandé, sur le projet lui-même :

| Étape | Contenu |
|---|---|
| créer | `src/index.ts` = `ANSWER = 42`, `data/seed.json`, `README.md` |
| checkpoint | `COMMITTED`, hash `14cd7f18…` |
| **casser** | `ANSWER = 0`, `data/seed.json` **supprimé**, `JUNK.txt` ajouté |
| restore | `POST /projects/:id/checkpoints/:id/restore` |
| vérifier | les 3 fichiers d'origine retrouvés au contenu exact ; `JUNK.txt` disparu ; hash relu **depuis le stockage** = hash du manifeste |

Encadrement du restore : checkpoint de **sûreté** pris d'abord (refus 409
`CHECKPOINT_SAFETY_FAILED` s'il échoue — on ne détruit pas sans point de retour,
et le retour est prouvé exploitable), barrière réarmée pendant l'écrasement,
hash divergent → 409 `CHECKPOINT_RESTORE_HASH_MISMATCH` plutôt qu'un succès
silencieux.

## Résultats

| Contrôle | Résultat |
|---|---|
| Suite checkpoint (4 fichiers) | **36/36 vert** |
| Suite complète `services/api` | **1328 vert**, 35 skipped, 1 échec **pré-existant** (`vitest-config-discovery`, flake `onTaskUpdate`) — corrigé ici en reprenant `3ae0927a` |
| `tsc --noEmit -p tsconfig.json` | **0 erreur** |

### CI sur la PR #78

`Production CI` (**Install, test, build, scan** — typecheck + tests + build) :
**success**. `Quality Gates`, `Release Validation`, `Validate registries`,
CodeQL js/ts, gitleaks, `Validate PR Title` : verts.

Deux échecs ont été rattrapés par la CI et corrigés :

1. **Typecheck** — `ConsistencyLevel` (qui contient `transaction-consistent`)
   n'était pas assignable au niveau d'un composant. Mon typecheck local avait
   été joué AVANT les derniers correctifs et ne l'avait pas vu. Corrigé en
   portant l'invariant dans le type (`DeclarableLevel`) plutôt qu'en castant :
   émettre un niveau interdit ne compile plus.
2. **Registres** — `CONTRACT_REGISTRY` exigeait l'accord fichier↔registre
   (CTR-CHECKPOINT v2 → v3) et `DOCUMENT_MANIFEST` devait être régénéré.

⚠️ **Piège worktree** (coûte des heures si non identifié) : `tsc` sortait 17
erreurs locales fantômes (`projectCheckpoint`, `thumbnailUrl` introuvables).
`services/api/node_modules/@vibecore/*` pointe vers `../../../../packages/…`,
résolu depuis le checkout PRINCIPAL, et la résolution imbriquée gagne sur la
racine : `tsc` lisait le client Prisma de `main`. Après shadow du `node_modules`
imbriqué → **0 erreur**. Signe distinctif : la CI ne voyait PAS ces erreurs.

Note build : `npm run build` échoue en local sur `TS5112` (tsc local plus récent
que celui de CI) **sur `main` aussi** — pré-existant, non lié à ce lot. Le
`tsconfig.json` du service porte des options **identiques** à la ligne de build
avec un `include` plus large (`src/**/*.ts` vs le graphe de `server.ts`), donc le
typecheck ci-dessus couvre un sur-ensemble.

## Artefacts

| Fichier | SHA-256 |
|---|---|
| `artifacts/checkpoint-tests.txt` | `1247ed036be88fee0cbe40259e1e8c6afc13ae8140a73e0eca69085886c89124` |
| `artifacts/manifest-sample.json` | `ebe143d524cc386a593fa541f3a7e81cb418860e602f37000428831052bb6e07` |

`artifacts/SHA256SUMS.txt` fait foi.

## Reste ouvert (déclaré, pas gonflé)

1. Restore **PITR CNPG réel** — la couverture base reste non prouvée.
2. **Gel côté pod** — prérequis de tout niveau > crash-consistent.
3. **Instant commun fichiers↔base** — prérequis de `transaction-consistent`.
4. **Preuve live prod** — à jouer après merge + déploiement ; non revendiquée ici.
