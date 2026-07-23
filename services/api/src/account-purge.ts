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
 * Optional physical-erasure hook passed into purgeUserAccount. It erases the
 * given projects' out-of-database storage (GCS buckets + workspace PVCs) and
 * reports the auditable classes + whether every one re-counted to 0 remaining.
 * FAIL-CLOSED contract: when it returns `verified: false`, the purge MUST NOT
 * stamp the account `purged` (throws / rolls back), so an account is only ever
 * marked erased once BOTH its rows and its physical storage are proven gone.
 * Omitted → DB-only purge (unit tests of the row layer).
 */
/** Per-subject physical footprint the store resolves for erasure (reserve #3). */
export interface PurgeStorageInventory {
  /** Projects whose per-project GCS bucket the subject owns (their sole orgs). */
  bucketProjectIds: string[];
  /** Every project the subject has a workspace in (sole-org + collaborator). */
  workspaceProjectIds: string[];
}

export interface PurgeStorageDeps {
  eraseStorage?: (inventory: PurgeStorageInventory) => Promise<{ classes: PurgeClassReport[]; verified: boolean }>;
}

/** Outcome of one purgeUserAccount attempt (store layer). */
export type PurgeUserAccountResult =
  | { outcome: 'purged'; proof: ErasureProof }
  | { outcome: 'already_purged'; purgedAt: string }
  | { outcome: 'not_requested' }
  | { outcome: 'not_due'; purgeDueAt: string };

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
      reason: entry.reason ?? 'unspecified_retention',
      rows: Object.values(entry.models).reduce((sum, count) => sum + count, 0),
    }));

  const verifiedZeroRemaining =
    input.classes
      .filter((entry) => entry.action === 'deleted')
      .every((entry) => entry.remainingAfterPurge === 0) &&
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
