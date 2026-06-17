/**
 * Replit-parity database point-in-time rollback (Pro: 28-day window).
 *
 * PHASE-1 SCAFFOLD — pure business rules only. The managed-database provisioning
 * and the WAL-based restore executor are later phases; everything here is
 * DORMANT and gated behind DB_ROLLBACK_ENABLED so it has no effect on live
 * traffic until the feature ships. See docs/REPLIT_PARITY_MATRIX.md §D and
 * migration 0040_database_pitr_scaffold.
 *
 * The retention window is plan-derived (`dbRollbackDays` in the credit-plan
 * catalog): Starter/Core = 0 (no rollback), Pro/Enterprise = 28 days.
 */
import { creditPlanCatalog, type CreditPlanKey } from '@vibecore/billing';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Master kill-switch. Until this is `true` no rollback endpoint does anything. */
export function isDatabaseRollbackEnabled(): boolean {
  return process.env.DB_ROLLBACK_ENABLED === 'true';
}

export interface DatabaseRollbackEntitlement {
  /** Whether the plan includes point-in-time rollback at all. */
  allowed: boolean;
  /** Retention window in days (0 when not allowed). */
  retentionDays: number;
}

/** Resolve a plan's rollback entitlement from the credit-plan catalog. */
export function databaseRollbackEntitlement(planKey: CreditPlanKey | string): DatabaseRollbackEntitlement {
  const plan = creditPlanCatalog.find((entry) => entry.key === planKey);
  const retentionDays = plan?.dbRollbackDays ?? 0;

  return { allowed: retentionDays > 0, retentionDays };
}

/**
 * The earliest point in time a plan can restore to (the floor of the retention
 * window). Restores targeting before this are rejected. Returns the epoch-ms
 * boundary; callers compare a requested target against it.
 */
export function retentionFloorMs(retentionDays: number, nowMs: number): number {
  return nowMs - Math.max(0, retentionDays) * DAY_MS;
}

export type RestoreTargetValidation =
  | { ok: true }
  | { ok: false; code: 'ROLLBACK_DISABLED' | 'PLAN_NOT_ELIGIBLE' | 'TARGET_IN_FUTURE' | 'TARGET_TOO_OLD'; message: string };

/**
 * Validate a point-in-time restore target against the plan's retention window.
 * This is the core PITR business rule and is unit-tested independently of any
 * database or HTTP wiring. A valid target is within `[now - retentionDays, now]`.
 */
export function validateRestoreTarget(input: {
  enabled: boolean;
  entitlement: DatabaseRollbackEntitlement;
  targetTimestampMs: number;
  nowMs: number;
}): RestoreTargetValidation {
  if (!input.enabled) {
    return { ok: false, code: 'ROLLBACK_DISABLED', message: 'Database rollback is not enabled.' };
  }

  if (!input.entitlement.allowed) {
    return { ok: false, code: 'PLAN_NOT_ELIGIBLE', message: 'Your plan does not include database rollback.' };
  }

  if (input.targetTimestampMs > input.nowMs) {
    return { ok: false, code: 'TARGET_IN_FUTURE', message: 'Restore target cannot be in the future.' };
  }

  const floor = retentionFloorMs(input.entitlement.retentionDays, input.nowMs);

  if (input.targetTimestampMs < floor) {
    return {
      ok: false,
      code: 'TARGET_TOO_OLD',
      message: `Restore target is outside the ${input.entitlement.retentionDays}-day retention window.`,
    };
  }

  return { ok: true };
}

/**
 * When a snapshot taken now should expire (its retention horizon). Snapshots
 * past this are pruned. Returns `null` when retention is 0 (no rollback) so the
 * caller doesn't persist an immediately-expired row.
 */
export function snapshotExpiryMs(createdAtMs: number, retentionDays: number): number | null {
  if (retentionDays <= 0) {
    return null;
  }

  return createdAtMs + retentionDays * DAY_MS;
}
