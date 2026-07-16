/**
 * Lifecycle state machines for Checkpoint and DB migration (audit v4 D + E).
 *
 * Both encode invariants that are SECURITY / data-loss properties, not
 * convenience:
 *  - Checkpoint: `BARRIER_ESTABLISHED` MUST precede any snapshot — without a
 *    logical barrier first, components snapshot at different instants and
 *    "consistency" is an illusion. The manifest is visible ONLY after every
 *    component snapshot verifies. Quiesce carries a mandatory timeout + thaw
 *    (a quiesce without a guaranteed thaw freezes the customer's project).
 *  - DB migration: `BACKUP_VERIFIED` precedes `APPLYING`; exactly ONE active
 *    migration per environment; a rollback NEVER assumes the DB is reverted.
 *
 * Pure module — no I/O — so the ordering guarantees are unit-testable.
 */

/* ==================== Checkpoint (two-phase barrier) ==================== */

export type CheckpointState =
  | 'PREPARING'
  | 'QUIESCING'
  | 'BARRIER_ESTABLISHED'
  | 'SNAPSHOTTING'
  | 'VERIFYING'
  | 'COMMITTED'
  | 'ABORTING'
  | 'CLEANED'
  | 'MANUAL_INTERVENTION';

export const CHECKPOINT_ORDER: CheckpointState[] = [
  'PREPARING',
  'QUIESCING',
  'BARRIER_ESTABLISHED',
  'SNAPSHOTTING',
  'VERIFYING',
  'COMMITTED',
];

const CHECKPOINT_TERMINAL: CheckpointState[] = ['COMMITTED', 'CLEANED', 'MANUAL_INTERVENTION'];

export class LifecycleError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LifecycleError';
  }
}

export function assertCheckpointTransition(from: CheckpointState, to: CheckpointState): void {
  if (CHECKPOINT_TERMINAL.includes(from)) {
    throw new LifecycleError(`Cannot leave terminal checkpoint state ${from}`, 'CHECKPOINT_TERMINAL');
  }

  // Failure branch: ABORTING from any non-terminal, then CLEANED / MANUAL_INTERVENTION.
  if (to === 'ABORTING') {
    return;
  }

  if (from === 'ABORTING') {
    if (to === 'CLEANED' || to === 'MANUAL_INTERVENTION') {
      return;
    }

    throw new LifecycleError(
      `ABORTING may only go to CLEANED / MANUAL_INTERVENTION, not ${to}`,
      'CHECKPOINT_BAD_ABORT',
    );
  }

  const fromIdx = CHECKPOINT_ORDER.indexOf(from);
  const toIdx = CHECKPOINT_ORDER.indexOf(to);

  if (toIdx !== fromIdx + 1) {
    // The security-critical guard: no snapshot before the barrier.
    if (to === 'SNAPSHOTTING' && from !== 'BARRIER_ESTABLISHED') {
      throw new LifecycleError(
        'SNAPSHOTTING requires BARRIER_ESTABLISHED first — snapshotting without a logical barrier yields inconsistent, different-instant snapshots.',
        'CHECKPOINT_SNAPSHOT_BEFORE_BARRIER',
      );
    }

    throw new LifecycleError(`Illegal checkpoint transition ${from}→${to}`, 'CHECKPOINT_BAD_TRANSITION');
  }
}

export interface QuiesceGuard {
  /** Quiesce must carry a timeout; a quiesce that can't thaw freezes the project. */
  timeoutMs: number;

  /** A thaw is always scheduled — even on the failure path. */
  thawGuaranteed: boolean;
}

/** A quiesce is only admissible with a finite timeout AND a guaranteed thaw. */
export function quiesceAdmissible(guard: QuiesceGuard): boolean {
  return Number.isFinite(guard.timeoutMs) && guard.timeoutMs > 0 && guard.thawGuaranteed === true;
}

export interface CheckpointComponentSnapshot {
  snapshotId: string;
  logicalBarrierId: string;
  startedAt: string;
  completedAt?: string;
  consistencyLevel: 'crash-consistent' | 'application-consistent' | 'UNKNOWN';
  encryptionKeyVersion: string;
  restoreCompatibility: string;
  verified: boolean;
}

/**
 * The manifest is visible ONLY after every component snapshot verifies AND they
 * all share the same logical barrier. Returns null while any is unverified —
 * "not yet a checkpoint", never a half-visible manifest.
 */
export function checkpointManifestVisible(
  components: CheckpointComponentSnapshot[],
  barrierId: string,
): { visible: boolean; reason?: string } {
  if (components.length === 0) {
    return { visible: false, reason: 'no components' };
  }

  const unverified = components.filter((c) => !c.verified);

  if (unverified.length > 0) {
    return { visible: false, reason: `${unverified.length} component snapshot(s) unverified` };
  }

  const wrongBarrier = components.filter((c) => c.logicalBarrierId !== barrierId);

  if (wrongBarrier.length > 0) {
    return { visible: false, reason: 'components snapshotted under different logical barriers (not the same instant)' };
  }

  return { visible: true };
}

/* ======================= DB migration execution ======================= */

export type MigrationState =
  | 'PLANNED'
  | 'LOCK_ACQUIRED'
  | 'BACKUP_VERIFIED'
  | 'APPLYING'
  | 'VALIDATING'
  | 'COMMITTED'
  | 'FAILED_SAFE'
  | 'FORWARD_FIX_REQUIRED'
  | 'MANUAL_RECOVERY';

export const MIGRATION_ORDER: MigrationState[] = [
  'PLANNED',
  'LOCK_ACQUIRED',
  'BACKUP_VERIFIED',
  'APPLYING',
  'VALIDATING',
  'COMMITTED',
];

const MIGRATION_TERMINAL: MigrationState[] = ['COMMITTED', 'FAILED_SAFE', 'FORWARD_FIX_REQUIRED', 'MANUAL_RECOVERY'];
const MIGRATION_FAILURE: MigrationState[] = ['FAILED_SAFE', 'FORWARD_FIX_REQUIRED', 'MANUAL_RECOVERY'];

export function assertMigrationTransition(from: MigrationState, to: MigrationState): void {
  if (MIGRATION_TERMINAL.includes(from)) {
    throw new LifecycleError(`Cannot leave terminal migration state ${from}`, 'MIGRATION_TERMINAL');
  }

  if (MIGRATION_FAILURE.includes(to)) {
    return; // a failure exit is reachable from any non-terminal state
  }

  const fromIdx = MIGRATION_ORDER.indexOf(from);
  const toIdx = MIGRATION_ORDER.indexOf(to);

  if (toIdx !== fromIdx + 1) {
    // Guard: never APPLY before the backup is verified.
    if (to === 'APPLYING' && from !== 'BACKUP_VERIFIED') {
      throw new LifecycleError(
        'APPLYING requires BACKUP_VERIFIED first — applying without a verified backup risks unrecoverable data loss.',
        'MIGRATION_APPLY_BEFORE_BACKUP',
      );
    }

    throw new LifecycleError(`Illegal migration transition ${from}→${to}`, 'MIGRATION_BAD_TRANSITION');
  }
}

export interface MigrationExecution {
  idempotencyKey: string;
  environment: string;
  state: MigrationState;
  backwardCompatible: boolean | 'UNKNOWN';
  forwardCompatible: boolean | 'UNKNOWN';
}

/**
 * Exactly ONE active migration per environment. Given the currently-active
 * migrations, returns whether a new one may start — a second active migration
 * in the same environment is refused.
 */
export function migrationMayStart(active: MigrationExecution[], environment: string): boolean {
  return !active.some((m) => m.environment === environment && !MIGRATION_TERMINAL.includes(m.state));
}
