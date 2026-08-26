# CHECKPOINT_CONTRACT — checkpoint projet (audit v4 I)

contractId: CTR-CHECKPOINT
contractVersion: 4
schemaVersion: 4
repoCommit: PENDING
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW # v1/v2 refusées ; v4 en validation avant intégration main, sans claim live
implementationAnchor: "migration 0089 + PrismaApiStore + LocalProjectStorage/GitCliProvider + routes checkpoint/restore ; bail DB-clock avec heartbeat, singleton projet et fencing ; barrière continue jusqu'au commit de restore ou du rollback de sûreté"

Contrat du checkpoint projet. Formalise DOMAIN_MODEL §6 + la machine à états
`services/api/src/lifecycle-state-machines.ts`.

## Machine à états

```
PREPARING → QUIESCING → BARRIER_ESTABLISHED → VOLUME_SNAPSHOTTING
  → DB_SNAPSHOTTING → (POD_SNAPSHOTTING optionnel) → VERIFYING → COMMITTED
échec → ABORTING → CLEANED | MANUAL_INTERVENTION
```

L'acquisition SQL plie `QUIESCING→BARRIER_ESTABLISHED` dans la même transaction
que le singleton/fence : aucun état `QUIESCING` visible ne prétend geler les
écritures avant que la barrière durable soit réellement possédée.

## Niveau de cohérence — DÉCLARÉ EXACT (réponse au refus P0-V3-09)

**Le checkpoint est `crash-consistent`. Il n'est ni `application-consistent` ni
`transaction-consistent`, et ne prétend pas l'être.**

Le niveau n'est plus une chaîne écrite à la main dans l'orchestrateur : il est
DÉRIVÉ de la portée réelle de la barrière par
`services/api/src/checkpoint-consistency.ts`, et
`checkpoint-consistency.spec.ts` échoue si un niveau de `NEVER_CLAIMED` apparaît
dans un manifeste. La sur-revendication est devenue une erreur de CI.

### Ce que la barrière gèle réellement

- Les écritures de l'arbre projet passant par le processus API, sur **tous les
  replicas** (le bail vit dans `ProjectCheckpoint.barrierExpiresAt`, plus dans
  une `Map` de processus — l'API tourne en 2 replicas, HPA → 6).
- Le garde est posé au **point d'étranglement du stockage**
  (`LocalProjectStorage` et `GitCliProvider`) sous le même verrou projet NFS que
  l'acquisition de la barrière. Cette linéarisation ferme la course
  vérification→écriture entre replicas. Le proxy générique couvre les adapters
  injectés et les tests.
- Le lease est renouvelé bien avant son TTL. Chaque transition, relecture,
  suppression d'arbre et écriture de fichier destructive revalide
  `(checkpointId, ownerToken, fence, lease vivante)` contre l'horloge PostgreSQL.
  Une perte est définitive pour le manager : aucune nouvelle mutation ni
  finalisation n'est autorisée.

### Ce qu'elle NE gèle PAS — limites structurelles, pas des TODO

- Les processus **dans le pod workspace** (dev server, terminal, `npm install`)
  écrivent leur propre volume `pvc-<workspaceId>` monté sur `/workspace`.
- Les **pods de tâches planifiées** montant ce même PVC (déclenchés par un
  `setInterval` in-process : aucune requête HTTP à intercepter).
- Le **worker BullMQ de déploiement** (build dans le pod).
- Les **clients SQL** de la base projet.

### Ce que le checkpoint capture réellement

L'arbre projet **côté API** (Filestore RWX `/data/vibecore`) — **pas** le volume
vif du pod. Ce sont deux volumes distincts, sans réconciliateur serveur : ils ne
convergent que lorsqu'un onglet navigateur autosauve. Sans onglet ouvert, la
copie capturée peut être en retard sur ce que l'utilisateur voit dans l'IDE.
C'est écrit dans le manifeste (`barrierScope`), pas sous-entendu.

### Atomicité inter-composants : FAUSSE, et dite telle quelle

Les composants sont snapshottés **en séquence**. Partager un `logicalBarrierId`
**ordonne** les étapes (rien ne commence avant que la barrière tienne) ; ça ne
crée **pas** un instant atomique commun. Le manifeste porte
`crossComponentAtomic: false`.

## Couverture par composant

| Composant      | État                                                      | Niveau           | Vérification                                                                |
| -------------- | --------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| FILES (volume) | **couvert, restauré, prouvé**                             | crash-consistent | `archive-reread-sha256-match` + re-hash APRÈS restore réel                  |
| DATABASE       | **non prouvé** — backup CNPG soumis, ni attendu ni rejoué | non revendiqué   | aucune : consigné en `bestEffortComponents`, jamais compté comme couverture |
| POD            | non implémenté                                            | —                | un snapshot de pod seul n'est jamais un checkpoint projet                   |

`takeSnapshot` rend la main dès que le CR `Backup` est accepté : il n'attend ni
la fin du backup ni sa restaurabilité. Le compter « verified » ferait croire à
une couverture base prouvée — il est donc **exclu des composants vérifiés** et la
base reste en `dependenciesDeclared`.

## Invariants (testés)

- **I-CKP-1** : un PodSnapshot seul n'est JAMAIS un checkpoint.
- **I-CKP-4** : tout snapshot exige `BARRIER_ESTABLISHED` d'abord
  (`CHECKPOINT_SNAPSHOT_BEFORE_BARRIER`).
- **I-CKP-5** : manifeste visible SSI tous les composants `verified` ET même
  `logicalBarrierId`.
- **I-CKP-6** : quiesce admissible ⇒ timeout fini > 0 ET dégel garanti.
- **I-CKP-A** : la barrière gèle réellement les écritures (423
  `CHECKPOINT_BARRIER_ACTIVE`) et se lève toujours — `finally` + expiration du
  bail. **Prouvé aussi depuis un SECOND replica** partageant le store, et sur une
  route destructive (`snapshots/:id/restore`) qui n'a jamais eu de garde
  explicite.
- **I-CKP-B** : échec en plein snapshot → `ABORTING`→`CLEANED` + barrière levée.
- **I-CKP-C** : un seul checkpoint/restore peut posséder la barrière d'un projet
  (`barrierProjectId UNIQUE`) ; deux clients PostgreSQL concurrents donnent un
  seul gagnant.
- **I-CKP-D** : une lease expirée ne peut pas être ressuscitée ; le successeur
  incrémente le fence et l'ancien propriétaire ne peut ni muter ni finaliser.
- **I-CKP-E** : restore vérifié par hash, dans un projet jetable
  (`restore-verify`).
- **I-CKP-F (nouveau)** : **restore RÉEL** — le projet lui-même est ramené à
  l'état du checkpoint ; l'état d'après restauration est **relu depuis le
  stockage** et re-hashé contre le manifeste. Hash divergent ⇒ 409
  `CHECKPOINT_RESTORE_HASH_MISMATCH`, jamais un succès silencieux.
- **I-CKP-G (nouveau)** : un restore prend d'abord un **checkpoint de sûreté** ;
  s'il échoue, le restore est refusé (409 `CHECKPOINT_SAFETY_FAILED`) — on ne
  détruit pas sans point de retour. Prouvé annulable : on revient à l'état
  d'avant restauration.
- **I-CKP-H** : la barrière du checkpoint de sûreté reste tenue sans interruption
  pendant restore, vérification et éventuel rollback automatique. Un hash
  divergent remet les octets d'origine sous le même fence avant de répondre.
- **I-CKP-I** : la transition `VERIFYING→COMMITTED`, le manifeste, la rétention
  et la libération conditionnelle forment un seul `UPDATE ... WHERE lease >
clock_timestamp()` ; deux finaliseurs n'ont qu'un gagnant.
- **I-CKP-J** : même si l'arbre semble déjà égal au checkpoint, le restore ne
  répond jamais depuis une lecture non clôturée : il prend le checkpoint de
  sûreté et conserve la barrière jusqu'au hash vérifié, afin qu'une écriture
  concurrente ne transforme pas un faux « no-op » en succès.

## Preuve de restore (le cycle demandé)

`services/api/src/tests/checkpoint-restore-proof.spec.ts` :
créer des données → checkpoint → **casser** (valeur modifiée, fichier supprimé,
fichier parasite ajouté) → `POST …/checkpoints/:id/restore` → les trois fichiers
d'origine sont retrouvés **avec leur contenu exact**, et le fichier parasite a
disparu (remplacement, pas fusion). Vérifié en relisant le stockage, pas
seulement la réponse HTTP.

## Manifeste (champs réels)

`logicalBarrierId` · `consistencyLevel` · `consistencyBasis` ·
`crossComponentAtomic` · `notClaimed[]` · `barrierScope{}` ·
`components[{componentKind, snapshotId, consistencyLevel, consistencyBasis,
unfrozenWriters[], verified, verificationMethod, encryptionKeyVersion,
restoreCompatibility}]` · `bestEffortComponents[]` · `contentHashes` ·
`restoreCompatibility` · `dependenciesDeclared[]` · `expiresAt` (TTL 30 j).

## Dépendances ouvertes (déclarées, pas gonflées)

1. **Couverture base non prouvée** — le restore PITR CNPG réel reste à jouer.
2. **Gel côté pod non implémenté** — tant que les écrivains in-pod ne sont pas
   quiescés, `application-consistent` restera hors de portée.
3. **Instant commun fichiers↔base non implémenté** — prérequis de
   `transaction-consistent`.

## Résultat de signature

v1 REFUSED · v2 REFUSED (P0-V3-09) · **v4 PENDING_REVIEW**. Le point
**reste OPEN jusqu'à signature expert** : cette version redescend le niveau
annoncé au niveau prouvé, ajoute le restore réel et rend la barrière effective —
elle ne prétend pas clore le sujet.
