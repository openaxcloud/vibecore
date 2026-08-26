import { appPublicEnglish } from './app-public-copy.js';

/**
 * Lifecycle state machines for Checkpoint, DB migration, and Promotion→Release
 * (audit v4 C + D + E).
 *
 * All encode invariants that are SECURITY / data-loss properties, not
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
  | 'VOLUME_SNAPSHOTTING'
  | 'DB_SNAPSHOTTING'
  | 'POD_SNAPSHOTTING'
  | 'VERIFYING'
  | 'COMMITTED'
  | 'ABORTING'
  | 'CLEANED'
  | 'MANUAL_INTERVENTION';

/*
 * Plan §15 : le snapshot est décomposé PAR COMPOSANT — volume (fichiers), base
 * de données, puis pod (OPTIONNEL : DB_SNAPSHOTTING peut brancher directement
 * vers VERIFYING). Un snapshot de pod SEUL n'est jamais un « checkpoint
 * projet » (projectCheckpointAdmissible).
 */
export const CHECKPOINT_ORDER: CheckpointState[] = [
  'PREPARING',
  'QUIESCING',
  'BARRIER_ESTABLISHED',
  'VOLUME_SNAPSHOTTING',
  'DB_SNAPSHOTTING',
  'POD_SNAPSHOTTING',
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

  // POD_SNAPSHOTTING est OPTIONNEL : DB_SNAPSHOTTING → VERIFYING est légal.
  if (from === 'DB_SNAPSHOTTING' && to === 'VERIFYING') {
    return;
  }

  if (toIdx !== fromIdx + 1) {
    // The security-critical guard: no snapshot before the barrier.
    if (to.endsWith('_SNAPSHOTTING') && from !== 'BARRIER_ESTABLISHED' && !String(from).endsWith('_SNAPSHOTTING')) {
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

export type CheckpointComponentKind = 'FILES' | 'DATABASE' | 'POD';

export interface CheckpointComponentSnapshot {
  /** Quel composant ce snapshot capture (plan §15). */
  componentKind: CheckpointComponentKind;
  snapshotId: string;
  logicalBarrierId: string;
  startedAt: string;
  completedAt?: string;
  consistencyLevel: 'crash-consistent' | 'application-consistent' | 'UNKNOWN';
  /** Pourquoi CE niveau — dérivé de la portée réelle de la barrière (P0-V3-09). */
  consistencyBasis?: string;
  /** Écrivains que la barrière n'atteint pas ; vide ⇒ rien ne pouvait écrire. */
  unfrozenWriters?: string[];
  encryptionKeyVersion: string;
  restoreCompatibility: string;
  verified: boolean;
  /**
   * COMMENT `verified` a été établi. Un booléen seul laisse croire à une preuve
   * qui n'a pas été faite ; la méthode dit exactement ce qui a été contrôlé.
   */
  verificationMethod?: string;
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

/* ==================== Promotion → Release (audit v4 C) ==================== */

/**
 * State machine layering the security mechanics of `artifact-promotion.ts`.
 *
 * Invariants:
 *  - I-PROMO-STATE-1: only a `PROMOTION_COMMITTED` promotion may be referenced by
 *    a `ReleaseManifest`. An incomplete promotion is CLEANED and can NEVER become
 *    a release ("une promotion incomplète est nettoyée et ne peut jamais devenir
 *    une release").
 *  - I-PROMO-STATE-2: the linear path enforces referrers-copied BEFORE
 *    target-verified BEFORE binauthz — a promotion can't be "committed" while
 *    skipping a gate.
 */
export type PromotionState =
  | 'PROMOTION_PREPARED'
  | 'PROMOTION_REFERRERS_COPIED'
  | 'PROMOTION_TARGET_VERIFIED'
  | 'PROMOTION_BINAUTHZ_PASSED'
  | 'PROMOTION_COMMITTED'
  | 'PROMOTION_ABORTED'
  | 'PROMOTION_CLEANED';

export const PROMOTION_ORDER: PromotionState[] = [
  'PROMOTION_PREPARED',
  'PROMOTION_REFERRERS_COPIED',
  'PROMOTION_TARGET_VERIFIED',
  'PROMOTION_BINAUTHZ_PASSED',
  'PROMOTION_COMMITTED',
];

const PROMOTION_TERMINAL: PromotionState[] = ['PROMOTION_COMMITTED', 'PROMOTION_CLEANED'];

export function assertPromotionTransition(from: PromotionState, to: PromotionState): void {
  if (PROMOTION_TERMINAL.includes(from)) {
    throw new LifecycleError(`Cannot leave terminal promotion state ${from}`, 'PROMOTION_TERMINAL');
  }

  // A promotion may abort from any non-terminal state, then only be CLEANED.
  if (to === 'PROMOTION_ABORTED') {
    return;
  }

  if (from === 'PROMOTION_ABORTED') {
    if (to === 'PROMOTION_CLEANED') {
      return;
    }

    throw new LifecycleError(
      `An aborted promotion may only be CLEANED, not ${to} — it can never become a release`,
      'PROMOTION_ABORTED_CANNOT_COMMIT',
    );
  }

  const fromIdx = PROMOTION_ORDER.indexOf(from);
  const toIdx = PROMOTION_ORDER.indexOf(to);

  if (toIdx !== fromIdx + 1) {
    if (to === 'PROMOTION_COMMITTED' && from !== 'PROMOTION_BINAUTHZ_PASSED') {
      throw new LifecycleError(
        'PROMOTION_COMMITTED requires PROMOTION_BINAUTHZ_PASSED first — cannot commit a promotion that skipped referrer copy, target verification, or Binary Authorization.',
        'PROMOTION_COMMIT_SKIPPED_GATE',
      );
    }

    throw new LifecycleError(`Illegal promotion transition ${from}→${to}`, 'PROMOTION_BAD_TRANSITION');
  }
}

export interface PromotionManifest {
  promotionId: string;
  sourceRepo: string;
  sourceDigest: string;
  targetRepo: string;
  targetTenant: string;
  retentionTag?: string;

  /** Every OCI referrer copied+relinked (signature/SBOM/provenance/…). */
  attachments: Array<{
    type: string;
    digest: string;
    subjectDigest: string;
    relinked: boolean;
    payloadDigests?: string[];
    predicateType?: string;
    evidenceFormat?: string;
  }>;
  binaryAuthorizationResult: 'PASSED' | 'DENIED' | 'UNKNOWN';
  binaryAuthorizationPolicy: string;
  binaryAuthorizationPolicyEtag: string;
  binaryAuthorizationEvaluatedImage: string;
  binaryAuthorizationEvaluatedAt: string;
  state: PromotionState;
  preparedAt: string;
  committedAt?: string;
}

export interface ReleaseManifest {
  releaseId: string;

  /** Provenance: the committed promotion this release was cut from. */
  promotionId: string;
  imageDigest: string;
  bundleDigest: string;
  sbomDigest: string;
  provenanceDigest: string;
  configDigest: string;

  /** Ties the release to the access policy in force (AUTH_ACCESS_CONTRACT). */
  accessPolicyVersion: string;
  createdAt: string;
  retentionExpiresAt: string;
  referenceCount: number;
}

/**
 * I-PROMO-STATE-1 gate: a ReleaseManifest may ONLY be cut from a promotion that
 * reached PROMOTION_COMMITTED. Returns the reason it is refused otherwise.
 */
export function releaseMayBeCut(promotion: PromotionManifest): { allowed: boolean; reason?: string } {
  if (promotion.state !== 'PROMOTION_COMMITTED') {
    return {
      allowed: false,
      reason: `promotion ${promotion.promotionId} is ${promotion.state}, not PROMOTION_COMMITTED — an incomplete promotion can never become a release`,
    };
  }

  const missing = promotion.attachments.filter((a) => !a.relinked);

  if (missing.length > 0) {
    return { allowed: false, reason: `${missing.length} attachment(s) not relinked into the tenant repo` };
  }

  if (promotion.binaryAuthorizationResult !== 'PASSED') {
    return { allowed: false, reason: `Binary Authorization is ${promotion.binaryAuthorizationResult}, not PASSED` };
  }

  if (
    !promotion.binaryAuthorizationPolicy ||
    !promotion.binaryAuthorizationPolicyEtag ||
    promotion.binaryAuthorizationEvaluatedImage !== `${promotion.targetRepo}@${promotion.sourceDigest}` ||
    !promotion.binaryAuthorizationEvaluatedAt
  ) {
    return { allowed: false, reason: 'Binary Authorization evidence is incomplete or targets another image' };
  }

  if (!promotion.retentionTag || !/^active-promo-[a-f0-9]{32}$/u.test(promotion.retentionTag)) {
    return { allowed: false, reason: 'promotion has no immutable active-* retention tag' };
  }

  return { allowed: true };
}

/*
 * BLOCKER #6 — timestamped workspace lifecycle machine.
 *
 * Workspace.status is a single overwritten value, so a workspace that flapped or
 * died leaves no trail. This validates the legal transitions of an append-only
 * lifecycle log (WorkspaceLifecycleEvent) so the reconstructed history can never
 * contain an impossible edge (e.g. STOPPED -> RUNNING without a restart).
 *
 *   PENDING -> STARTING -> RUNNING -> STOPPING -> STOPPED
 *   any live state -> FAILED (a crash can happen from anywhere)
 *   STOPPED / FAILED -> STARTING (reopen / self-heal)
 */
export type WorkspaceLifecycleState = 'PENDING' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';

const WORKSPACE_LIFECYCLE_NEXT: Record<WorkspaceLifecycleState, WorkspaceLifecycleState[]> = {
  PENDING: ['STARTING', 'FAILED'],

  /*
   * A user can stop (or a probe can fail) mid-startup; this system never emits an
   * intermediate STOPPING status, so STARTING may go straight to STOPPED.
   */
  STARTING: ['RUNNING', 'STOPPING', 'STOPPED', 'FAILED'],
  RUNNING: ['STOPPING', 'STOPPED', 'FAILED'],
  STOPPING: ['STOPPED', 'FAILED'],

  // Terminal-ish, but a workspace is re-openable: a reopen/self-heal restarts it.
  STOPPED: ['STARTING'],
  FAILED: ['STARTING'],
};

export function assertWorkspaceLifecycleTransition(from: WorkspaceLifecycleState, to: WorkspaceLifecycleState): void {
  /*
   * Idempotent re-assertion of the same state is a no-op, not an error: two
   * manager replicas can both observe the same transition.
   */
  if (from === to) {
    return;
  }

  if (!WORKSPACE_LIFECYCLE_NEXT[from].includes(to)) {
    throw new LifecycleError(
      `Illegal workspace lifecycle transition ${from} -> ${to}`,
      'WORKSPACE_LIFECYCLE_BAD_TRANSITION',
    );
  }
}

/** Map the coarse WorkspaceStatus persisted today onto the lifecycle machine. */
export function lifecycleStateFromStatus(status: string): WorkspaceLifecycleState {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'STARTING':
      return 'STARTING';
    case 'RUNNING':
      return 'RUNNING';
    case 'STOPPED':
    case 'DELETED':
      return 'STOPPED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/**
 * Un « checkpoint PROJET » exige le composant FILES vérifié, et le composant
 * DATABASE dès qu'une base est provisionnée (sinon la dépendance doit être
 * DÉCLARÉE explicitement — infra dormante, jamais un silence). Un snapshot de
 * POD seul n'est JAMAIS un checkpoint projet.
 */
export function projectCheckpointAdmissible(
  components: CheckpointComponentSnapshot[],
  opts: { databaseProvisioned: boolean; databaseDependencyDeclared?: boolean },
): { admissible: boolean; reason?: string } {
  const kinds = new Set(components.map((c) => c.componentKind));

  if (kinds.size === 1 && kinds.has('POD')) {
    return { admissible: false, reason: appPublicEnglish('CHECKPOINT_COMPONENT_POD_ONLY') };
  }

  if (!kinds.has('FILES')) {
    return { admissible: false, reason: appPublicEnglish('CHECKPOINT_COMPONENT_FILES_MISSING') };
  }

  if (opts.databaseProvisioned && !kinds.has('DATABASE') && opts.databaseDependencyDeclared !== true) {
    return {
      admissible: false,
      reason: appPublicEnglish('CHECKPOINT_DATABASE_DEPENDENCY_MISSING'),
    };
  }

  return { admissible: true };
}
