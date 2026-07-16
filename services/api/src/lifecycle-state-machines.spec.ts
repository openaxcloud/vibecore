import { describe, expect, it } from 'vitest';

import {
  LifecycleError,
  assertCheckpointTransition,
  assertMigrationTransition,
  checkpointManifestVisible,
  migrationMayStart,
  quiesceAdmissible,
  type CheckpointComponentSnapshot,
  type MigrationExecution,
} from './lifecycle-state-machines.js';

describe('checkpoint two-phase barrier (audit v4 D)', () => {
  it('accepts the full normative path PREPARING→…→COMMITTED', () => {
    const path = [
      ['PREPARING', 'QUIESCING'],
      ['QUIESCING', 'BARRIER_ESTABLISHED'],
      ['BARRIER_ESTABLISHED', 'SNAPSHOTTING'],
      ['SNAPSHOTTING', 'VERIFYING'],
      ['VERIFYING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertCheckpointTransition(from, to)).not.toThrow();
    }
  });

  it('REFUSES snapshotting before the barrier is established (the illusion-of-consistency bug)', () => {
    try {
      assertCheckpointTransition('QUIESCING', 'SNAPSHOTTING');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LifecycleError);
      expect((error as LifecycleError).code).toBe('CHECKPOINT_SNAPSHOT_BEFORE_BARRIER');
    }
  });

  it('allows ABORTING from any non-terminal state, then CLEANED / MANUAL_INTERVENTION', () => {
    for (const from of ['PREPARING', 'QUIESCING', 'BARRIER_ESTABLISHED', 'SNAPSHOTTING', 'VERIFYING'] as const) {
      expect(() => assertCheckpointTransition(from, 'ABORTING')).not.toThrow();
    }
    expect(() => assertCheckpointTransition('ABORTING', 'CLEANED')).not.toThrow();
    expect(() => assertCheckpointTransition('ABORTING', 'COMMITTED')).toThrowError(/CLEANED/);
  });

  it('quiesce is inadmissible without a finite timeout AND a guaranteed thaw', () => {
    expect(quiesceAdmissible({ timeoutMs: 30_000, thawGuaranteed: true })).toBe(true);
    expect(quiesceAdmissible({ timeoutMs: 30_000, thawGuaranteed: false })).toBe(false); // freezes the project
    expect(quiesceAdmissible({ timeoutMs: Number.POSITIVE_INFINITY, thawGuaranteed: true })).toBe(false);
    expect(quiesceAdmissible({ timeoutMs: 0, thawGuaranteed: true })).toBe(false);
  });

  const component = (over: Partial<CheckpointComponentSnapshot>): CheckpointComponentSnapshot => ({
    snapshotId: 's',
    logicalBarrierId: 'barrier-1',
    startedAt: '2026-07-16T00:00:00Z',
    consistencyLevel: 'application-consistent',
    encryptionKeyVersion: 'k1',
    restoreCompatibility: 'v1',
    verified: true,
    ...over,
  });

  it('manifest is visible ONLY after every component verifies under the SAME barrier', () => {
    const barrier = 'barrier-1';
    expect(
      checkpointManifestVisible([component({ snapshotId: 'a' }), component({ snapshotId: 'b' })], barrier).visible,
    ).toBe(true);

    // One unverified → not visible.
    expect(checkpointManifestVisible([component({}), component({ verified: false })], barrier).visible).toBe(false);

    // Different barrier → not the same instant → not visible.
    const mixed = checkpointManifestVisible([component({}), component({ logicalBarrierId: 'barrier-2' })], barrier);
    expect(mixed.visible).toBe(false);
    expect(mixed.reason).toMatch(/different logical barriers/);
  });
});

describe('DB migration execution (audit v4 E)', () => {
  it('accepts PLANNED→…→COMMITTED', () => {
    const path = [
      ['PLANNED', 'LOCK_ACQUIRED'],
      ['LOCK_ACQUIRED', 'BACKUP_VERIFIED'],
      ['BACKUP_VERIFIED', 'APPLYING'],
      ['APPLYING', 'VALIDATING'],
      ['VALIDATING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertMigrationTransition(from, to)).not.toThrow();
    }
  });

  it('REFUSES applying before the backup is verified', () => {
    try {
      assertMigrationTransition('LOCK_ACQUIRED', 'APPLYING');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as LifecycleError).code).toBe('MIGRATION_APPLY_BEFORE_BACKUP');
    }
  });

  it('allows FAILED_SAFE / FORWARD_FIX_REQUIRED / MANUAL_RECOVERY from any non-terminal state', () => {
    for (const from of ['PLANNED', 'LOCK_ACQUIRED', 'BACKUP_VERIFIED', 'APPLYING', 'VALIDATING'] as const) {
      expect(() => assertMigrationTransition(from, 'FAILED_SAFE')).not.toThrow();
      expect(() => assertMigrationTransition(from, 'MANUAL_RECOVERY')).not.toThrow();
    }
  });

  it('enforces exactly ONE active migration per environment', () => {
    const active: MigrationExecution[] = [
      {
        idempotencyKey: 'k1',
        environment: 'production',
        state: 'APPLYING',
        backwardCompatible: true,
        forwardCompatible: 'UNKNOWN',
      },
    ];
    expect(migrationMayStart(active, 'production')).toBe(false); // second in prod refused
    expect(migrationMayStart(active, 'development')).toBe(true); // different env ok
    // Once the prod one is terminal, a new one may start.
    active[0].state = 'COMMITTED';
    expect(migrationMayStart(active, 'production')).toBe(true);
  });
});
