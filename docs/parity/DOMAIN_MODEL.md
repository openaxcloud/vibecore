# DOMAIN_MODEL — entités, invariants, machines à états

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: modèle Import ancien + CloudTenant incomplet + Checkpoint/Release faibles (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — modèle Import ancien + CloudTenant incomplet + Checkpoint/Release faibles — puis re-soumettre à signature
Schémas JSON exécutables: `docs/parity/schemas/domain/*.schema.json`.
Règle: ce document reflète les domaines TRANCHÉS (décisions Avi). Ce qui n'est
pas tranché est marqué UNKNOWN. Rien ici n'est une promesse d'implémentation:
l'état d'implémentation vit dans PARITY_STATUS.md.

## 1. Remix / Fork d'un projet

Machine à états (ordre NORMATIF — le détachement des credentials précède le clone):

```
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → SOURCE_SANITIZED → CLONING
  → DB_FORKING → STORAGE_POLICY_APPLIED → SCANNING → INDEXING
```

Invariants:
- I-RMX-1: les secrets sont des RÉFÉRENCES; la valeur n'est **jamais exportée**
  dans un remix (ni dans un snapshot, ni dans l'archive clonée).
- I-RMX-2: `CREDENTIALS_DETACHED` est un prérequis dur de `CLONING` — un clone
  qui démarre avec des credentials attachés est un bug de sécurité, pas un état.
- I-RMX-3 (licence + PII, P0-V3-05): la licence et le consentement sont
  VERSIONNÉS — le job épingle `licenseSnapshot` (id + sha256 du texte accepté)
  et `consentVersion`; une édition ultérieure du listing ne réécrit jamais ce
  qui a été accepté. Les PII (emails, téléphones internationaux, IBAN, cartes
  Luhn-valides) sont MASQUÉES en `SOURCE_SANITIZED` avant le clone, sauf
  consentement explicite versionné de l'auteur (`piiConsentVersion`) —
  enregistré, jamais silencieux. Les findings portent {path, kind, line},
  jamais la valeur.
- I-RMX-PROV: le remix produit un nouveau projet/propriétaire/repo/workspace/
  locks; données isolées; lien vers la source conservé (provenance).
- Cardinalité: Projet source 1 → N remixes; un remix a exactement 1 source.
- Rétention/migrations: UNKNOWN (non tranché).
- `DB_FORKING` reste un marqueur honnête (isolation, pas de copie physique) —
  fork DB physique + copie d'objets = RMX-4/5, follow-up déclaré.

## 2. Import (staging jetable)

États: `QUARANTINED`, `AWAITING_USER_ACTION`, `COMMITTING`, `ROLLING_BACK`, `EXPIRED`.

Invariants:
- I-IMP-1: le staging est JETABLE et ne monte **jamais** le workspace cible.
- I-IMP-2: **aucune suppression silencieuse** — toute perte potentielle passe
  par `AWAITING_USER_ACTION`.
- I-IMP-3: commit **atomique** ou rollback **intégral** — pas d'état
  partiellement importé observable.
- I-IMP-4: `EXPIRED` est terminal pour le staging; le workspace cible est
  intact octet pour octet.

## 3. CloudTenant

- `CloudTenant` = frontière (billing/quota/isolation).
- `CloudProjectBinding[1..N]` par tenant, rôle ∈
  { `PRIMARY`, `REGION_SHARD`, `QUOTA_SHARD`, `MIGRATION_TARGET` }.
- Invariant I-TEN-1: **aucun projet partagé entre deux tenants** (binding
  projet→tenant est unique).
- Défaut: 1 projet primaire par tenant.

### Hiérarchie GCP — le folder-per-tenant est mort (audit v4 P0-#3)

**Faits vérifiés (Resource Manager, mot pour mot)** : « A parent folder cannot
contain more than 300 folders » (enfants directs) ; profondeur max 10 ; et le
**vrai mur** : la **création de folders est plafonnée à ~0,1 req/s = 6/min**
(quota d'écriture Resource Manager).

- Le cap de 300 se **contourne par sharding** ; le **débit de création, NON** —
  c'est un plafond série dur. À 1 000 clients, un folder par tenant = 1000/6 ≈
  **167 min ≈ 2,8 h** de rate-limit pur, avant tout travail réel.
- I-TEN-2: **pas de folder par tenant par défaut**. Les tenants se mappent sur un
  petit ensemble FIXE de partitions `shard-<n>`, chacune dimensionnée **sous
  300** enfants (marge 10%). Un folder dédié par tenant n'est créé que sur
  **exigence contractuelle/policy mesurée** (et refusé si le coût-temps dépasse
  le seuil).
- I-TEN-3: `CapacityPolicy` porte à la fois les **quotas** (enfants/parent,
  profondeur) ET les **rate limits de création** — le provisioning se cadence
  au lieu de heurter un mur de 429.
- Implémentation prouvée : `services/api/src/capacity-policy.ts`
  (`requiredShardCount`, `shardForTenant` déterministe, `estimateProvisioning`).
  6 tests : 1000 tenants → **4 shards** (~40 s) admissibles ; folder-per-tenant
  1000 = **10 000 s (2,78 h)** INADMISSIBLE par défaut ; un petit
  folder-per-tenant contractuel (30) reste admissible.

## 4. IAM (identités d'exécution)

Identités SÉPARÉES: `BuildIdentity` / `PromotionIdentity` / `RuntimeIdentity`.

- I-IAM-1: RuntimeIdentity est par **app × environnement × frontière de
  privilège**, et **réutilisée par les révisions** — jamais une identité par
  déploiement.
- I-IAM-2: **zéro clé persistante** — fédération/identités de charge de
  travail uniquement (Workload Identity), tokens courts.
- I-IAM-3: BuildIdentity ne peut pas promouvoir; PromotionIdentity ne peut pas
  builder; séparation vérifiable par IAM policy.

## 5. Rollback / ReleaseCatalog / Promotion

- `ReleaseCatalog` = **source de vérité** des releases.
- Retient par release: image **par digest** + bundle + SBOM + provenance + config.
- GC: uniquement après **zéro référence ET expiration** de rétention.
- I-REL-1: le rollback doit fonctionner **même si la révision Cloud Run a
  disparu** (Cloud Run supprime au-delà de 1000 révisions/service) — le
  catalogue est suffisant pour re-déployer, il ne dépend d'aucun état runtime.

### Promotion d'image vers un tenant — invariant sécurité (audit v4 P0-#4)

**Fait vérifié** : Artifact Registry stocke la **signature, le SBOM et la
provenance comme referrers/attachments OCI SÉPARÉS** liés au digest de l'image.
Une copie par digest (`gcloud … copy` ou équivalent) copie **uniquement le
manifeste d'image** — les attachments NE SUIVENT PAS. Promouvoir par digest seul
livre une image **non vérifiable** chez le tenant (Binary Authorization n'a rien
à contrôler).

- I-PROMO-1: la promotion doit **découvrir TOUS les referrers** du digest source,
  **copier ET re-lier** chaque attachment dans le repo tenant, puis **VÉRIFIER
  présence + subjectDigest dans le contexte tenant**, enfin passer la barrière
  **Binary Authorization**. Un attachment manquant/désaligné à N'IMPORTE quelle
  étape ⇒ **promotion BLOQUÉE** + rollback (le tenant ne reçoit jamais d'image
  non vérifiable).
- I-PROMO-2: une image dont les attestations sont **déjà incomplètes à la
  source** n'est **jamais** promue (non vérifiable par construction).
- Implémentation prouvée : `services/api/src/artifact-promotion.ts`
  (`promoteArtifact` + `RegistryAdapter`). 7 tests dont **4 négatifs** (SBOM
  source manquant → `PROMOTION_SOURCE_INCOMPLETE` ; relink silencieux échoué →
  `PROMOTION_TARGET_UNVERIFIED` ; BinAuthz refusé → `PROMOTION_BINAUTHZ_DENIED` ;
  image source absente). L'adapter live Artifact Registry (API OCI referrers) est
  un follow-up infra — la logique de sécurité vit et est prouvée dans le module.
  🟡 Promotion réelle contre un AR live = non exécutée (nécessite creds infra).

### Machine à états Promotion → Release (audit v4 C)

Au-dessus des mécaniques de copie, une **machine à états** (prouvée dans
`services/api/src/lifecycle-state-machines.ts`, `assertPromotionTransition` +
`releaseMayBeCut`, 4 tests) porte l'ordre et le nettoyage :

```
PROMOTION_PREPARED → PROMOTION_REFERRERS_COPIED → PROMOTION_TARGET_VERIFIED
                   → PROMOTION_BINAUTHZ_PASSED → PROMOTION_COMMITTED
échec (n'importe quel état) → PROMOTION_ABORTED → PROMOTION_CLEANED
```

- **I-PROMO-STATE-1** : **seule** une promotion `PROMOTION_COMMITTED` peut être
  référencée par une `ReleaseManifest`. *Une promotion incomplète est nettoyée et
  ne peut jamais devenir une release* — `PROMOTION_ABORTED` ne va **que** vers
  `PROMOTION_CLEANED` (jamais `PROMOTION_COMMITTED`), et `releaseMayBeCut` refuse
  toute promotion non committée, tout attachment non re-lié, ou BinAuthz ≠ PASSED.
- **I-PROMO-STATE-2** : `PROMOTION_COMMITTED` exige `PROMOTION_BINAUTHZ_PASSED`
  d'abord → impossible de committer une promotion qui a sauté la copie des
  referrers, la vérification tenant, ou Binary Authorization
  (`PROMOTION_COMMIT_SKIPPED_GATE`).

**`PromotionManifest`** (schéma dans le module) : `promotionId`, `sourceRepo`,
`sourceDigest`, `targetRepo`, `targetTenant`, `attachments[{type, digest,
subjectDigest, relinked}]`, `binaryAuthorizationResult ∈ {PASSED|DENIED|UNKNOWN}`,
`state`, `preparedAt`, `committedAt?`.

**`ReleaseManifest`** : `releaseId`, `promotionId` (provenance = la promotion
committée d'où la release est tirée), `imageDigest`, `bundleDigest`, `sbomDigest`,
`provenanceDigest`, `configDigest`, `accessPolicyVersion` (lie la release à la
politique d'accès en vigueur — cf. AUTH_ACCESS_CONTRACT / RPL-23), `createdAt`,
`retentionExpiresAt`, `referenceCount`.

- I-REL-2 (rollback DB) : *la base de données n'est jamais supposée inversée par
  un rollback*. Un rollback re-déploie une **image** depuis le `ReleaseCatalog` ;
  il ne réécrit pas l'état DB. La compatibilité schéma est portée par la machine
  de migration (§ ci-dessous, `backwardCompatible`/`forwardCompatible`), pas par
  le rollback.

## 6. Checkpoint projet — barrière en deux phases (audit v4 D)

Pipeline: quiesce → **établir la barrière logique** → CSI VolumeSnapshot → DB
snapshot/branch → PodSnapshot (optionnel) → vérifier tous les snapshots →
manifest signé. Machine à états prouvée dans
`services/api/src/lifecycle-state-machines.ts`
(`assertCheckpointTransition` + `checkpointManifestVisible` + `quiesceAdmissible`) :

```
PREPARING → QUIESCING → BARRIER_ESTABLISHED → SNAPSHOTTING → VERIFYING → COMMITTED
échec → ABORTING → CLEANED | MANUAL_INTERVENTION
```

- I-CKP-1: **un PodSnapshot seul n'est JAMAIS un checkpoint projet** — la doc
  GKE dit mot pour mot que les volumes persistants ne sont pas checkpointés.
- I-CKP-2: le manifest signé liste chaque artefact (snapshot volume, snapshot
  DB, éventuel PodSnapshot) avec digest; un manifest incomplet est invalide.
- I-CKP-3: restauration = transaction: tout ou rien.
- **I-CKP-4 (barrière avant snapshot)** : `SNAPSHOTTING` exige
  `BARRIER_ESTABLISHED` d'abord (`CHECKPOINT_SNAPSHOT_BEFORE_BARRIER`). Sans
  barrière logique établie EN PREMIER, les composants ne snapshotent pas le même
  instant et la « cohérence » est une illusion.
- **I-CKP-5 (manifest visible après vérif)** : `checkpointManifestVisible` ne
  renvoie `visible` que si **tous** les composants sont `verified` ET partagent le
  **même** `logicalBarrierId` — jamais de manifest à moitié visible.
- **I-CKP-6 (quiesce = timeout + dégel)** : `quiesceAdmissible` exige un
  `timeoutMs` fini > 0 ET `thawGuaranteed === true`. Un quiesce sans dégel garanti
  gèle le projet du client.

## 7. Migration DB (audit v4 E)

Machine à états prouvée dans `services/api/src/lifecycle-state-machines.ts`
(`assertMigrationTransition` + `migrationMayStart`) :

```
PLANNED → LOCK_ACQUIRED → BACKUP_VERIFIED → APPLYING → VALIDATING → COMMITTED
échec → FAILED_SAFE | FORWARD_FIX_REQUIRED | MANUAL_RECOVERY
```

- **I-MIG-1 (backup avant apply)** : `APPLYING` exige `BACKUP_VERIFIED` d'abord
  (`MIGRATION_APPLY_BEFORE_BACKUP`). Appliquer sans backup vérifié risque une
  perte de données irrécupérable.
- **I-MIG-2 (une seule active par env)** : `migrationMayStart` refuse une seconde
  migration active dans le même `environment` (une active à la fois par
  environnement).
- **I-MIG-3** : `MigrationExecution` porte `backwardCompatible` /
  `forwardCompatible` (`boolean | 'UNKNOWN'`) — la compatibilité schéma est
  explicite, jamais supposée. Couplé à I-REL-2 : un rollback d'**image** ne
  suppose jamais la DB inversée.

## 8. Entités billing (implémentées — voir BILLING_LEDGER_CONTRACT.md)

RateCard (compute, versionnée), AgentRoutingCard (LLM, versionnée),
AiCostLedger, CreditWallet/CreditPack/CreditLedger (append-only),
AgentCheckpoint, AgentCallLog, UsageEvent/QuotaLedger.
