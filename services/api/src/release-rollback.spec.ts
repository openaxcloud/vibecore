import { describe, expect, it } from 'vitest';

import { RollbackError, resolveRollbackImage, retainRelease, type RetainedRelease } from './release-rollback.js';

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
});
