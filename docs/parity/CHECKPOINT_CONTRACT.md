# CHECKPOINT_CONTRACT — checkpoint projet (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: tests unitaires mais aucun câblage réel (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — tests unitaires mais aucun câblage réel — puis re-soumettre à signature

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
