import { describe, expect, it } from 'vitest';

import {
  LifecycleError,
  assertCheckpointTransition,
  assertMigrationTransition,
  assertPromotionTransition,
  checkpointManifestVisible,
  migrationMayStart,
  quiesceAdmissible,
  releaseMayBeCut,
  type CheckpointComponentSnapshot,
  type MigrationExecution,
  type PromotionManifest,
} from './lifecycle-state-machines.js';

describe('checkpoint two-phase barrier (audit v4 D)', () => {
  it('accepts the full normative path PREPARING→…→COMMITTED', () => {
    const path = [
      ['PREPARING', 'QUIESCING'],
      ['QUIESCING', 'BARRIER_ESTABLISHED'],
      ['BARRIER_ESTABLISHED', 'VOLUME_SNAPSHOTTING'],
      ['VOLUME_SNAPSHOTTING', 'DB_SNAPSHOTTING'],
      ['DB_SNAPSHOTTING', 'VERIFYING'], // POD est optionnel — saut légal
      ['VERIFYING', 'COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertCheckpointTransition(from, to)).not.toThrow();
    }
  });

  it('REFUSES snapshotting before the barrier is established (the illusion-of-consistency bug)', () => {
    try {
      assertCheckpointTransition('QUIESCING', 'VOLUME_SNAPSHOTTING');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LifecycleError);
      expect((error as LifecycleError).code).toBe('CHECKPOINT_SNAPSHOT_BEFORE_BARRIER');
    }
  });

  it('allows ABORTING from any non-terminal state, then CLEANED / MANUAL_INTERVENTION', () => {
    for (const from of ['PREPARING', 'QUIESCING', 'BARRIER_ESTABLISHED', 'VOLUME_SNAPSHOTTING', 'VERIFYING'] as const) {
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
    componentKind: 'FILES',
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

describe('promotion → release (audit v4 C)', () => {
  it('accepts PROMOTION_PREPARED→…→PROMOTION_COMMITTED', () => {
    const path = [
      ['PROMOTION_PREPARED', 'PROMOTION_REFERRERS_COPIED'],
      ['PROMOTION_REFERRERS_COPIED', 'PROMOTION_TARGET_VERIFIED'],
      ['PROMOTION_TARGET_VERIFIED', 'PROMOTION_BINAUTHZ_PASSED'],
      ['PROMOTION_BINAUTHZ_PASSED', 'PROMOTION_COMMITTED'],
    ] as const;

    for (const [from, to] of path) {
      expect(() => assertPromotionTransition(from, to)).not.toThrow();
    }
  });

  it('REFUSES committing a promotion that skipped a gate', () => {
    try {
      assertPromotionTransition('PROMOTION_TARGET_VERIFIED', 'PROMOTION_COMMITTED');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as LifecycleError).code).toBe('PROMOTION_COMMIT_SKIPPED_GATE');
    }
  });

  it('an aborted promotion may only be CLEANED — never committed (never becomes a release)', () => {
    expect(() => assertPromotionTransition('PROMOTION_REFERRERS_COPIED', 'PROMOTION_ABORTED')).not.toThrow();
    expect(() => assertPromotionTransition('PROMOTION_ABORTED', 'PROMOTION_CLEANED')).not.toThrow();
    expect(() => assertPromotionTransition('PROMOTION_ABORTED', 'PROMOTION_COMMITTED')).toThrowError(
      /never become a release/,
    );
  });

  const manifest = (over: Partial<PromotionManifest>): PromotionManifest => ({
    promotionId: 'promo-1',
    sourceRepo: 'src',
    sourceDigest: 'sha256:aaa',
    targetRepo: 'tenant-repo',
    targetTenant: 't1',
    retentionTag: `active-promo-${'a'.repeat(32)}`,
    attachments: [{ type: 'signature', digest: 'sha256:sig', subjectDigest: 'sha256:aaa', relinked: true }],
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    binaryAuthorizationEvaluatedImage: 'tenant-repo@sha256:aaa',
    binaryAuthorizationEvaluatedAt: '2026-07-16T00:00:30Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-07-16T00:00:00Z',
    committedAt: '2026-07-16T00:01:00Z',
    ...over,
  });

  it('a release may be cut ONLY from a committed, fully-attested promotion', () => {
    expect(releaseMayBeCut(manifest({})).allowed).toBe(true);

    // Incomplete promotion → never a release.
    const notCommitted = releaseMayBeCut(manifest({ state: 'PROMOTION_TARGET_VERIFIED' }));
    expect(notCommitted.allowed).toBe(false);
    expect(notCommitted.reason).toMatch(/never become a release/);

    // Committed but an attachment never relinked → refused.
    expect(
      releaseMayBeCut(
        manifest({
          attachments: [{ type: 'sbom', digest: 'sha256:s', subjectDigest: 'sha256:aaa', relinked: false }],
        }),
      ).allowed,
    ).toBe(false);

    // Committed but BinAuthz not passed → refused.
    expect(releaseMayBeCut(manifest({ binaryAuthorizationResult: 'UNKNOWN' })).allowed).toBe(false);
  });
});
