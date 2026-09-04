# CHECKPOINT_CONTRACT — checkpoint projet (audit v4 I)

contractId: CTR-CHECKPOINT
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED : « tests unitaires mais aucun câblage réel » — v2 : machine CÂBLÉE derrière de vrais endpoints, re-soumission requise
implementationAnchor: "PR feat/project-checkpoint-wiring (NON MERGÉE) : POST /projects/:id/checkpoints + GET + restore-verify ; machine étendue VOLUME→DB→POD(optionnel) ; barrière d'écriture réelle (423 + dégel garanti finally + auto-expiration) ; manifeste complet ; 18 tests dont barrière observée EN VOL et restore vérifié en projet jetable"

Contrat du checkpoint projet. Formalise DOMAIN_MODEL §6 + la machine à états
prouvée `services/api/src/lifecycle-state-machines.ts` (checkpoint two-phase
barrier, audit v4 D).

## Machine à états

```
PREPARING → QUIESCING → BARRIER_ESTABLISHED → SNAPSHOTTING → VERIFYING → COMMITTED
échec → ABORTING → CLEANED | MANUAL_INTERVENTION
```

## Invariants (prouvés par test, `lifecycle-state-machines.spec.ts`)

- **I-CKP-1** : un PodSnapshot seul n'est JAMAIS un checkpoint (les PV ne sont pas
  checkpointés — doc GKE).
- **I-CKP-4 (barrière avant snapshot)** : `SNAPSHOTTING` exige
  `BARRIER_ESTABLISHED` d'abord (`CHECKPOINT_SNAPSHOT_BEFORE_BARRIER`). Sans
  barrière logique établie EN PREMIER, les composants ne parlent pas du même
  instant → « cohérence » illusoire.
- **I-CKP-5 (manifest après vérif)** : `checkpointManifestVisible` visible SSI
  tous les composants `verified` ET même `logicalBarrierId` — jamais à moitié.
- **I-CKP-6 (quiesce = timeout + dégel)** : `quiesceAdmissible` exige `timeoutMs`
  fini > 0 ET `thawGuaranteed` — un quiesce sans dégel gèle le projet.
- **I-CKP-3** : restauration = transaction tout-ou-rien.

## Champs `CheckpointComponentSnapshot`

`snapshotId`, `logicalBarrierId`, `startedAt`, `completedAt?`, `consistencyLevel
∈ {crash-consistent|application-consistent|UNKNOWN}`, `encryptionKeyVersion`,
`restoreCompatibility`, `verified`.

## 🟡

Preuve e2e (stage `create`/`modify` du vertical) non encore taggée ; la logique
d'ordre est prouvée en unitaire (négatifs inclus), le parcours live = follow-up.

## Câblage réel (v2 — répond au refus)

- Machine ÉTENDUE (plan §15) : PREPARING→QUIESCING→BARRIER_ESTABLISHED→
  VOLUME_SNAPSHOTTING→DB_SNAPSHOTTING→(POD_SNAPSHOTTING optionnel)→VERIFYING→
  COMMITTED ; échec : ABORTING→CLEANED|MANUAL_INTERVENTION.

## Préconditions
- P-CKP-1 : quiesce admissible AVANT tout gel (timeout fini + dégel garanti) —
  refus sinon, jamais un gel sans sortie.
- P-CKP-2 : tout snapshot de composant exige BARRIER_ESTABLISHED (garde
  CHECKPOINT_SNAPSHOT_BEFORE_BARRIER) et porte le même logicalBarrierId.

## Invariants (testés)
- I-CKP-A : la barrière GÈLE réellement les écritures API fichiers (423
  CHECKPOINT_BARRIER_ACTIVE) et se LÈVE toujours — finally + auto-expiration
  (prouvé : écriture 423 pendant un snapshot retenu en vol, puis passe).
- I-CKP-B : échec en plein snapshot → ABORTING→CLEANED + barrière levée
  (prouvé par injection de panne).
- I-CKP-C : le manifeste n'est visible qu'une fois TOUS les composants vérifiés
  sous la MÊME barrière (checkpointManifestVisible).
- I-CKP-D : un snapshot de POD seul n'est JAMAIS un checkpoint projet
  (projectCheckpointAdmissible — testé) ; base provisionnée sans composant
  DATABASE = refus SAUF dépendance déclarée explicitement.
- I-CKP-E : restore VÉRIFIÉ par hash de contenu, dans un projet JETABLE —
  jamais d'écrasement du source (prouvé : modification post-checkpoint
  n'apparaît pas dans le restore).

## Manifeste (champs réels)
logicalBarrierId · consistencyLevel (application-consistent si tous les
composants le sont, sinon crash-consistent) · components[{componentKind,
snapshotId, hash, verified, encryptionKeyVersion, restoreCompatibility}] ·
contentHashes · restoreCompatibility {files: project-files-v1, database:
cnpg-pitr-v1|n/a} · dependenciesDeclared[] · expiresAt (TTL 30 j).

## Tests négatifs
- snapshot avant barrière → CHECKPOINT_SNAPSHOT_BEFORE_BARRIER (unitaire) ;
- pod-seul → inadmissible ; DB provisionnée sans composant ni déclaration →
  inadmissible ; quiesce sans timeout/dégel → refus ; panne → CLEANED+dégel.

## Dépendance ouverte (déclarée, pas gonflée)
Le snapshot DB PHYSIQUE (CNPG/Barman takeSnapshot + restore PITR) est câblé
mais DORMANT derrière DB_ROLLBACK_ENABLED ; quand la base est provisionnée et
le flag éteint, le checkpoint est FICHIERS-SEULS avec dependenciesDeclared
explicite. La preuve PITR live prod reste un chantier (PR-DR).

## Résultat de signature
v1 : REFUSED. v2 : PENDING_REVIEW — câblage réel + 18 tests ; signature =
merge + reçu complet.

