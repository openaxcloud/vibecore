/**
 * Account-purge worker support (pure, IO-free) — the EXECUTOR half of the
 * self-serve deletion machine in ./data-deletion.ts (§16.12 : tombstone →
 * fenêtre de récupération → purge réelle → PREUVE d'effacement).
 *
 * The state machine (request → 14-day grace → ready_to_purge) lives in
 * data-deletion.ts; this module defines the structured ERASURE PROOF the purge
 * executor persists (per data class: rows deleted / anonymized / retained with
 * an explicit reason, plus a post-purge "0 rows remaining" verification), and
 * the pure helpers to assemble/validate it. The store's purgeUserAccount
 * (prisma-store.ts / test-api-store.ts) produces one proof per purged account;
 * the /internal/account-purge route records it to the AdminAuditLog.
 */

import { appPublicEnglish } from './app-public-copy.js';

/** How a data class was handled by the purge. */
export type PurgeAction = 'deleted' | 'anonymized' | 'retained';

/** One data class in the erasure proof. */
export interface PurgeClassReport {
  /** Stable class key (sessions, ai_history, financial_records, ...). */
  dataClass: string;
  /** What happened to the class as a whole. */
  action: PurgeAction;
  /** Rows affected per concrete model (Session, AiConversation, ...). */
  models: Record<string, number>;
  /** Mandatory motive when action === 'retained' (fail-closed exceptions). */
  reason?: string;
  /** Exact non-secret resource evidence when a physical class needs audit replay. */
  evidence?: Record<string, unknown>;
  /**
   * Post-purge verification for DELETED classes: rows still matching the purge
   * selector after the deletes ran. Must be 0 for the proof to verify.
   */
  remainingAfterPurge?: number;
}

/** A consigned exception: rows we could NOT erase, and exactly why. */
export interface PurgeException {
  dataClass: string;
  reason: string;
  rows: number;
}

/**
 * The persisted, auditable proof of erasure (§16.12). Written to the
 * AdminAuditLog (action account.purge_completed) by the purge route.
 */
export interface ErasureProof {
  version: 1;
  kind: 'account-erasure-proof';
  userId: string;
  requestedAt: string;
  purgedAt: string;
  classes: PurgeClassReport[];
  /** Retention exceptions, consigned — never silent. */
  exceptions: PurgeException[];
  /** True only when every deleted class re-counted to 0 rows post-purge. */
  verifiedZeroRemaining: boolean;
}

/**
 * Required physical-erasure hook passed into purgeUserAccount. It erases the
 * given projects' out-of-database storage (GCS buckets + workspace PVCs) and
 * reports the auditable classes + whether every one re-counted to 0 remaining.
 * FAIL-CLOSED contract: when it returns `verified: false`, the purge MUST NOT
 * stamp the account `purged` (throws / rolls back), so an account is only ever
 * marked erased once BOTH its rows and its physical storage are proven gone.
 */
/** Per-subject physical footprint the store resolves for erasure (reserve #3). */
export interface PurgeStorageInventory {
  /** Projects whose per-project GCS bucket the subject owns (their sole orgs). */
  bucketProjectIds: string[];
  /** Every project the subject has a workspace in (sole-org + collaborator). */
  workspaceProjectIds: string[];
  /**
   * Durable local ProjectSnapshot objects captured before DB rows cascade away.
   * The project id binds each untrusted DB key to its tenant-owned namespace.
   */
  localSnapshotObjects: Array<{ projectId: string; storageKey: string }>;
  /**
   * Every static deployment artifact owned by a sole-member organization.
   * Includes ids referenced only by append-only ReleaseManifest rows.
   */
  staticDeploymentIds: string[];
  /** Content-addressed static release objects referenced by those projects. */
  staticArtifactRefs: string[];
  /** Source/target ids used to remove routing aliases that mention purged deployments. */
  staticAliasDeploymentIds: string[];
}

export interface PurgeEffectDescriptor {
  /** Stable, per-plan idempotency key. */
  key: string;
  resourceType:
    | 'billing_subscription'
    | 'gcs_bucket'
    | 'workspace_barrier'
    | 'k8s_service'
    | 'k8s_pod'
    | 'k8s_secret'
    | 'k8s_pvc'
    | 'local_project_storage'
    | 'local_project_archive'
    | 'local_project_snapshot'
    | 'local_workspace_storage'
    | 'static_deployment_snapshot'
    | 'static_release_artifact'
    | 'static_routing_alias';
  resourceId: string;
}

export interface PurgeEffectExecution<T> {
  /** False when a durable SUCCEEDED receipt allowed the effect to be skipped. */
  executed: boolean;
  receipt: T;
}

/**
 * The only authority allowed to execute an irreversible physical effect. The
 * implementation locks the PurgePlan row, evaluates the lease on the PostgreSQL
 * clock, keeps that lock for the whole provider call, then commits its receipt.
 * Reclaim/renew therefore linearise either before or after the effect, never in
 * its middle.
 */
export type PurgeEffectExecutor = <T extends Record<string, unknown>>(
  descriptor: PurgeEffectDescriptor,
  effect: () => Promise<T>,
) => Promise<PurgeEffectExecution<T>>;

export interface PurgeLeaseContext {
  planId: string;
  ownerToken: string;
  validate: () => Promise<void>;
  executeEffect: PurgeEffectExecutor;
}

export interface PurgeStorageDeps {
  /**
   * Cancels one live provider subscription. The caller supplies a stable
   * per-plan idempotency key, so a provider success followed by a lost database
   * response can be retried without creating an ambiguous double effect.
   * Omission is fail-closed whenever the purge inventory contains an externally
   * billed, non-terminal subscription.
   */
  cancelExternalBilling?: (
    externalSubscriptionId: string,
    idempotencyKey: string,
  ) => Promise<{ canceled: boolean; providerStatus?: string }>;

  /**
   * `guard` (RR-CODEX-12) is called before each irreversible bucket/PVC delete; it
   * throws if the purge lease has been lost, aborting the erasure. `fenceToken`
   * (RR-CODEX-14 v5, R-P3-05) is the PER-ATTEMPT owner token (the plan's ownerToken)
   * used as the durable workspace-barrier fence — NOT a stable per-subject id.
   */
  eraseStorage: (
    inventory: PurgeStorageInventory,
    lease: PurgeLeaseContext,
  ) => Promise<{ classes: PurgeClassReport[]; verified: boolean }>;

  /**
   * RR-CODEX-14 v5 (R-P3-04): release the durable WORKSPACE barrier on EVERY exit
   * (abandon / success). Fenced by the same per-attempt token, so a delayed release
   * from a prior attempt can never lift a newer attempt's barrier. Called in the
   * store's finally after the DB guarantee is released.
   */
  releaseWorkspaceBarrier?: (inventory: PurgeStorageInventory, planId: string, fenceToken: string) => Promise<void>;
}

/** Outcome of one purgeUserAccount attempt (store layer). */
export type PurgeUserAccountResult =
  | { outcome: 'purged'; planId: string; proof: ErasureProof }
  | { outcome: 'already_purged'; planId?: string; purgedAt: string }
  | { outcome: 'not_requested' }
  | { outcome: 'not_due'; purgeDueAt: string };

export interface AccountPurgePreview {
  userId: string;
  status: 'missing' | 'not_requested' | 'not_due' | 'ready_to_purge' | 'purged';
  databaseNow: string;
  requestedAt?: string;
  purgeDueAt?: string;
  purgedAt?: string;
  /** A purged tombstone is trusted only when its immutable receipt exists. */
  receiptVerified?: boolean;
  inventory?: PurgeStorageInventory;
}

/** Tombstone e-mail for the anonymized user row (unique per user, no PII). */
export function anonymizedEmail(userId: string): string {
  return `purged-${userId}@erased.invalid`;
}

/** Tombstone slug for an anonymized sole-member organization (unique, no PII). */
export function anonymizedOrgSlug(organizationId: string): string {
  return `purged-${organizationId}`;
}

/**
 * Assemble the proof from per-class reports. Derives the exceptions list from
 * every retained class (a retained class without a reason is a programming
 * error — fail closed by refusing to mark the proof verified) and computes the
 * "0 rows remaining" verification across deleted classes.
 */
export function buildErasureProof(input: {
  userId: string;
  requestedAt: string;
  purgedAt: string;
  classes: PurgeClassReport[];
}): ErasureProof {
  const exceptions: PurgeException[] = input.classes
    .filter((entry) => entry.action === 'retained')
    .map((entry) => ({
      dataClass: entry.dataClass,
      reason: entry.reason ?? appPublicEnglish('ACCOUNT_PURGE_RETENTION_UNSPECIFIED'),
      rows: Object.values(entry.models).reduce((sum, count) => sum + count, 0),
    }));

  const verifiedZeroRemaining =
    input.classes.filter((entry) => entry.action === 'deleted').every((entry) => entry.remainingAfterPurge === 0) &&
    input.classes.filter((entry) => entry.action === 'retained').every((entry) => Boolean(entry.reason));

  return {
    version: 1,
    kind: 'account-erasure-proof',
    userId: input.userId,
    requestedAt: input.requestedAt,
    purgedAt: input.purgedAt,
    classes: input.classes,
    exceptions,
    verifiedZeroRemaining,
  };
}

/** Total rows a proof claims were physically deleted. */
export function proofDeletedRows(proof: ErasureProof): number {
  return proof.classes
    .filter((entry) => entry.action === 'deleted')
    .reduce((sum, entry) => sum + Object.values(entry.models).reduce((s, c) => s + c, 0), 0);
}
