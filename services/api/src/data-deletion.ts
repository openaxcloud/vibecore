/**
 * Replit-parity self-serve account/data deletion (pure, IO-free).
 * Request → grace/cancellation window → purge. Some financial records are
 * retained for compliance. See docs/REPLIT_PARITY_SPEC.md §16.5.
 */

export const DELETION_GRACE_PERIOD_DAYS = 14;
export const FINANCIAL_RETENTION_DAYS = 2555; // ~7 years
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DeletionStatus = 'none' | 'requested' | 'grace_period' | 'ready_to_purge' | 'purged';

/** What a deletion removes vs retains (for the confirmation UI / audit). */
export function deletionScope(): { deleted: string[]; retained: string[] } {
  return {
    deleted: ['Projects and workspaces', 'Templates', 'Chats and AI history', 'Profile and personal information', 'Connected accounts'],
    retained: ['Invoices and payment records (legal/financial retention)', 'Security audit logs (limited window)'],
  };
}

/** The timestamp (ms) at which purge becomes due. */
export function purgeDueAtMs(requestedAtMs: number): number {
  return requestedAtMs + DELETION_GRACE_PERIOD_DAYS * MS_PER_DAY;
}

/** Current deletion status. */
export function deletionStatus(input: {
  requestedAtMs: number | null;
  purgedAtMs: number | null;
  nowMs: number;
}): DeletionStatus {
  if (input.purgedAtMs != null) {
    return 'purged';
  }
  if (input.requestedAtMs == null || !Number.isFinite(input.requestedAtMs)) {
    return 'none';
  }
  if (!Number.isFinite(input.nowMs)) {
    return 'grace_period';
  }
  return input.nowMs >= purgeDueAtMs(input.requestedAtMs) ? 'ready_to_purge' : 'grace_period';
}

/** Whether the user can still cancel (within grace + not yet purged). */
export function canCancelDeletion(input: {
  requestedAtMs: number | null;
  purgedAtMs: number | null;
  nowMs: number;
}): boolean {
  return deletionStatus(input) === 'grace_period';
}

/** A financial record may only be purged after the retention window. */
export function canPurgeFinancialRecord(recordCreatedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(recordCreatedAtMs) || !Number.isFinite(nowMs)) {
    return false; // fail closed
  }
  return nowMs - recordCreatedAtMs >= FINANCIAL_RETENTION_DAYS * MS_PER_DAY;
}
