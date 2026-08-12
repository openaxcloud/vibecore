import { describe, expect, it } from 'vitest';

import {
  assertConfigDigestMatches,
  RollbackError,
  resolveRollbackImage,
  resolveRollbackSecrets,
  retainRelease,
  type RetainedRelease,
} from './release-rollback.js';
import { configDigest } from './release-manifest.js';

const IMAGE_URI = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/app-proj123:v2';
const DIGEST = 'sha256:' + 'a'.repeat(64);

function retained(over: Partial<RetainedRelease> = {}): RetainedRelease {
  return {
    deploymentId: 'dep-v1',
    projectId: 'proj123',
    imageRef: 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/app-proj123',
    imageDigest: DIGEST,
    createdAt: '2026-07-16T00:00:00Z',
    ...over,
  };
}

describe('retainRelease (audit v4 rollback)', () => {
  it('records the immutable ref (digest) from a successful build, stripping the tag', () => {
    const rel = retainRelease({
      deploymentId: 'dep-v1',
      projectId: 'proj123',
      imageUri: IMAGE_URI,
      digest: DIGEST,
      createdAt: '2026-07-16T00:00:00Z',
    });
    expect(rel.imageRef).toBe('europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/app-proj123');
    expect(rel.imageDigest).toBe(DIGEST);
  });

  it('REFUSES to retain a release with no digest — it could never be a rollback target', () => {
    expect(() =>
      retainRelease({ deploymentId: 'd', projectId: 'p', imageUri: IMAGE_URI, digest: undefined, createdAt: 'x' }),
    ).toThrowError(/no sha256 image digest/);

    try {
      retainRelease({ deploymentId: 'd', projectId: 'p', imageUri: IMAGE_URI, digest: 'not-a-digest', createdAt: 'x' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('RELEASE_NO_DIGEST');
    }
  });
});

describe('resolveRollbackImage (I-REL-1 / I-REL-2)', () => {
  it('resolves the immutable pull-by-digest ref from the retained release', () => {
    const plan = resolveRollbackImage(retained(), { revisionExists: true });
    expect(plan.pullRef).toBe('europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/app-proj123@' + DIGEST);
    expect(plan.pullRef).toContain('@sha256:');
    expect(plan.fromDeploymentId).toBe('dep-v1');
  });

  it('I-REL-1: still resolves v1 even after the CURRENT revision is deleted', () => {
    /*
     * The exact required scenario: deploy v1 → v2 → delete v1's revision → rollback.
     * The plan comes entirely from the retained digest, so a gone revision cannot block it.
     */
    const plan = resolveRollbackImage(retained(), { revisionExists: false });
    expect(plan.pullRef).toBe('europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/app-proj123@' + DIGEST);
    expect(plan.resolvedWithoutLiveRevision).toBe(true);
  });

  it('REFUSES a rollback with no retained digest instead of pointing at a dead URL (the current bug)', () => {
    try {
      resolveRollbackImage(retained({ imageDigest: '' }), { revisionExists: true });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_NO_RETAINED_DIGEST');
    }
  });

  it('REFUSES when there is no retained release at all', () => {
    expect(() => resolveRollbackImage(null, { revisionExists: true })).toThrowError(/No retained release/);
  });

  it('I-REL-2: the plan carries an image only — no DB state, nothing implying the DB was reverted', () => {
    const plan = resolveRollbackImage(retained(), { revisionExists: true });
    expect(Object.keys(plan).sort()).toEqual(
      ['fromDeploymentId', 'imageDigest', 'pullRef', 'resolvedWithoutLiveRevision'].sort(),
    );
  });

  // Expert refusal v3, point 2 — the ORIGINAL release's generation pin is carried.
  it('carries the release generation pin from retainRelease → RetainedRelease → RollbackPlan', () => {
    const rel = retainRelease({
      deploymentId: 'dep-v1',
      projectId: 'proj123',
      imageUri: IMAGE_URI,
      digest: DIGEST,
      createdAt: '2026-07-16T00:00:00Z',
      storeGeneration: 'gen-2',
    });
    expect(rel.storeGeneration).toBe('gen-2');

    const plan = resolveRollbackImage(rel, { revisionExists: false });
    // The rollback re-pins gen-2 (the release's generation), NOT the current active.
    expect(plan.storeGeneration).toBe('gen-2');
  });

  it('a release built without a lock carries no generation pin (rollback runs ungoverned, as the original did)', () => {
    const plan = resolveRollbackImage(retained(), { revisionExists: true });
    expect(plan.storeGeneration).toBeUndefined();
  });
});

describe('resolveRollbackSecrets — rollback after secret rotation', () => {
  it('policy CURRENT: the rolled-back release runs with the ROTATED (current) value', () => {
    // Secret was rotated after v1 shipped: API_KEY old→new. Policy CURRENT applies new.
    const res = resolveRollbackSecrets({
      policy: 'CURRENT',
      currentSecrets: { API_KEY: 'new-rotated-value' },
      pinnedSecrets: { API_KEY: 'old-value-at-v1' },
    });
    expect(res.secrets.API_KEY).toBe('new-rotated-value');
    expect(res.pinned).toBe(false);
  });

  it('policy PINNED with a retained snapshot: runs with the values as of the original release', () => {
    const res = resolveRollbackSecrets({
      policy: 'PINNED',
      currentSecrets: { API_KEY: 'new-rotated-value' },
      pinnedSecrets: { API_KEY: 'old-value-at-v1' },
    });
    expect(res.secrets.API_KEY).toBe('old-value-at-v1');
    expect(res.pinned).toBe(true);
  });

  it('policy PINNED with NO retained snapshot: REFUSES instead of faking (ProjectSecret keeps no history)', () => {
    try {
      resolveRollbackSecrets({ policy: 'PINNED', currentSecrets: { API_KEY: 'new' }, pinnedSecrets: null });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');
    }
  });
});

describe('assertConfigDigestMatches (reserve #4 — deterministic config invariant)', () => {
  it('passes when the current config fingerprints identically to the release digest', () => {
    const secrets = { API_KEY: 'v1-value', DATABASE_URL: 'postgres://x' };
    const recorded = configDigest(secrets);
    // Same effective config at rollback time — deterministic restore is provable.
    expect(() => assertConfigDigestMatches(configDigest({ ...secrets }), recorded)).not.toThrow();
  });

  it('passes for the empty-config sentinel on both sides (project with no secrets)', () => {
    expect(() => assertConfigDigestMatches(configDigest({}), configDigest({}))).not.toThrow();
  });

  it('REFUSES (mismatch) when a secret was rotated since the release', () => {
    const recorded = configDigest({ API_KEY: 'old-value-at-v1' });
    try {
      assertConfigDigestMatches(configDigest({ API_KEY: 'new-rotated-value' }), recorded);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_CONFIG_DIGEST_MISMATCH');
      expect((error as RollbackError).statusCode).toBe(409);
    }
  });

  it('REFUSES (mismatch) when a secret was added since the release', () => {
    const recorded = configDigest({ API_KEY: 'v1' });
    try {
      assertConfigDigestMatches(configDigest({ API_KEY: 'v1', NEW_SECRET: 'x' }), recorded);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_CONFIG_DIGEST_MISMATCH');
    }
  });

  it('REFUSES (unknown) when the release recorded no config digest', () => {
    try {
      assertConfigDigestMatches(configDigest({ API_KEY: 'v1' }), undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_CONFIG_DIGEST_UNKNOWN');
    }
  });

  it('REFUSES (unknown) when the release digest is malformed', () => {
    try {
      assertConfigDigestMatches(configDigest({ API_KEY: 'v1' }), 'not-a-digest');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_CONFIG_DIGEST_UNKNOWN');
    }
  });

  it('REFUSES (unknown) when the current config could not be fingerprinted', () => {
    try {
      assertConfigDigestMatches(undefined, configDigest({ API_KEY: 'v1' }));
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackError).code).toBe('ROLLBACK_CONFIG_DIGEST_UNKNOWN');
    }
  });
});
