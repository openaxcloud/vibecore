# DOMAIN_MODEL — entités, invariants, machines à états

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
Schémas JSON exécutables: `docs/parity/schemas/domain/*.schema.json`.
Règle: ce document reflète les domaines TRANCHÉS (décisions Avi). Ce qui n'est
pas tranché est marqué UNKNOWN. Rien ici n'est une promesse d'implémentation:
l'état d'implémentation vit dans PARITY_STATUS.md.

## 1. Remix / Fork d'un projet

Machine à états (ordre NORMATIF — le détachement des credentials précède le clone):

```
SNAPSHOT_PINNED → CREDENTIALS_DETACHED → CLONING → DB_FORKING
  → STORAGE_POLICY_APPLIED → SCANNING → INDEXING
```

Invariants:
- I-RMX-1: les secrets sont des RÉFÉRENCES; la valeur n'est **jamais exportée**
  dans un remix (ni dans un snapshot, ni dans l'archive clonée).
- I-RMX-2: `CREDENTIALS_DETACHED` est un prérequis dur de `CLONING` — un clone
  qui démarre avec des credentials attachés est un bug de sécurité, pas un état.
- I-RMX-3: le remix produit un nouveau projet/propriétaire/repo/workspace/locks;
  données isolées; lien vers la source conservé (provenance).
- Cardinalité: Projet source 1 → N remixes; un remix a exactement 1 source.
- Rétention/migrations: UNKNOWN (non tranché).

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

## 4. IAM (identités d'exécution)

Identités SÉPARÉES: `BuildIdentity` / `PromotionIdentity` / `RuntimeIdentity`.

- I-IAM-1: RuntimeIdentity est par **app × environnement × frontière de
  privilège**, et **réutilisée par les révisions** — jamais une identité par
  déploiement.
- I-IAM-2: **zéro clé persistante** — fédération/identités de charge de
  travail uniquement (Workload Identity), tokens courts.
- I-IAM-3: BuildIdentity ne peut pas promouvoir; PromotionIdentity ne peut pas
  builder; séparation vérifiable par IAM policy.

## 5. Rollback / ReleaseCatalog

- `ReleaseCatalog` = **source de vérité** des releases.
- Retient par release: image **par digest** + bundle + SBOM + provenance + config.
- GC: uniquement après **zéro référence ET expiration** de rétention.
- I-REL-1: le rollback doit fonctionner **même si la révision Cloud Run a
  disparu** (Cloud Run supprime au-delà de 1000 révisions/service) — le
  catalogue est suffisant pour re-déployer, il ne dépend d'aucun état runtime.

## 6. Checkpoint projet

Pipeline: quiesce → flush → CSI VolumeSnapshot → DB snapshot/branch →
PodSnapshot (optionnel) → manifest signé.

- I-CKP-1: **un PodSnapshot seul n'est JAMAIS un checkpoint projet** — la doc
  GKE dit mot pour mot que les volumes persistants ne sont pas checkpointés.
- I-CKP-2: le manifest signé liste chaque artefact (snapshot volume, snapshot
  DB, éventuel PodSnapshot) avec digest; un manifest incomplet est invalide.
- I-CKP-3: restauration = transaction: tout ou rien.

## 7. Entités billing (implémentées — voir BILLING_LEDGER_CONTRACT.md)

RateCard (compute, versionnée), AgentRoutingCard (LLM, versionnée),
AiCostLedger, CreditWallet/CreditPack/CreditLedger (append-only),
AgentCheckpoint, AgentCallLog, UsageEvent/QuotaLedger.
