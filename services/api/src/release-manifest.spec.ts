import { describe, expect, it } from 'vitest';
import type { ReleaseManifestRecord } from './store.js';
import {
  assertArtifactMatchesManifest,
  configDigest,
  hashSnapshotEntries,
  RollbackManifestError,
  selectPreviousRelease,
} from './release-manifest.js';

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

function manifest(version: number, over: Partial<ReleaseManifestRecord> = {}): ReleaseManifestRecord {
  return {
    id: `rm-${version}`,
    projectId: 'p1',
    deploymentId: `d-${version}`,
    environment: 'preview',
    version,
    provider: 'static',
    artifactKind: 'static-snapshot',
    artifactRef: `static-deployments/d-${version}`,
    artifactDigest: `sha256:${String(version).repeat(64).slice(0, 64)}`,
    accessPolicyVersion: 1,
    createdAt: '2026-08-04T00:00:00.000Z',
    ...over,
  };
}

describe('hashSnapshotEntries (P0-V3-08 content digest)', () => {
  it('is a sha256:… string and order-independent', () => {
    const a = hashSnapshotEntries([
      { path: 'index.html', sha256: 'aa' },
      { path: 'assets/app.js', sha256: 'bb' },
    ]);
    const b = hashSnapshotEntries([
      { path: 'assets/app.js', sha256: 'bb' },
      { path: 'index.html', sha256: 'aa' },
    ]);
    expect(a).toMatch(DIGEST_RE);
    expect(a).toBe(b);
  });

  it('changes when a file content hash changes', () => {
    const a = hashSnapshotEntries([{ path: 'index.html', sha256: 'aa' }]);
    const b = hashSnapshotEntries([{ path: 'index.html', sha256: 'ab' }]);
    expect(a).not.toBe(b);
  });

  it('changes when a file is renamed (path is bound to the hash)', () => {
    const a = hashSnapshotEntries([{ path: 'index.html', sha256: 'aa' }]);
    const b = hashSnapshotEntries([{ path: 'index.htm', sha256: 'aa' }]);
    expect(a).not.toBe(b);
  });

  it('distinguishes {a, b} from a single concatenated entry (NUL framing)', () => {
    const two = hashSnapshotEntries([
      { path: 'a', sha256: 'x' },
      { path: 'b', sha256: 'y' },
    ]);
    const one = hashSnapshotEntries([{ path: 'a\0xb', sha256: 'y' }]);
    expect(two).not.toBe(one);
  });
});

describe('configDigest', () => {
  it('is stable regardless of key insertion order', () => {
    expect(configDigest({ A: '1', B: '2' })).toBe(configDigest({ B: '2', A: '1' }));
  });

  it('changes when a value changes', () => {
    expect(configDigest({ A: '1' })).not.toBe(configDigest({ A: '2' }));
  });
});

describe('selectPreviousRelease (fail-closed N-1)', () => {
  it('returns current=N, previous=N-1 from a version-desc history', () => {
    const { current, previous } = selectPreviousRelease([manifest(3), manifest(2), manifest(1)]);
    expect(current.version).toBe(3);
    expect(previous.version).toBe(2);
  });

  it('refuses with ROLLBACK_NO_MANIFEST when there is no history', () => {
    expect(() => selectPreviousRelease([])).toThrowError(RollbackManifestError);
    try {
      selectPreviousRelease([]);
    } catch (error) {
      expect((error as RollbackManifestError).code).toBe('ROLLBACK_NO_MANIFEST');
      expect((error as RollbackManifestError).statusCode).toBe(409);
    }
  });

  it('refuses with ROLLBACK_NO_PREVIOUS_MANIFEST when only one release exists', () => {
    try {
      selectPreviousRelease([manifest(1)]);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackManifestError).code).toBe('ROLLBACK_NO_PREVIOUS_MANIFEST');
    }
  });

  it('refuses with ROLLBACK_PREVIOUS_NO_DIGEST when N-1 has no usable digest', () => {
    try {
      selectPreviousRelease([manifest(2), manifest(1, { artifactDigest: 'not-a-digest' })]);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackManifestError).code).toBe('ROLLBACK_PREVIOUS_NO_DIGEST');
    }
  });
});

describe('assertArtifactMatchesManifest (no blind rollback)', () => {
  it('passes when the recomputed digest matches', () => {
    const m = manifest(1);
    expect(() => assertArtifactMatchesManifest(m.artifactDigest, m)).not.toThrow();
  });

  it('fails closed on a digest mismatch', () => {
    const m = manifest(1);
    try {
      assertArtifactMatchesManifest('sha256:' + 'f'.repeat(64), m);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as RollbackManifestError).code).toBe('ROLLBACK_ARTIFACT_DIGEST_MISMATCH');
      expect((error as RollbackManifestError).statusCode).toBe(409);
    }
  });
});
