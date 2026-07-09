import { describe, expect, it } from 'vitest';
import { shouldReattachWarmWorkspace } from './workspace-reattach';

const warm = {
  reused: true,
  seededThisSession: true,
  hasLivePort: true,
  storageNewerThanSeed: false,
};

describe('shouldReattachWarmWorkspace', () => {
  it('reattaches when the pod is warm, seeded this page-session, and serving a live port', () => {
    expect(shouldReattachWarmWorkspace(warm)).toBe(true);
  });

  it('reseeds a cold (freshly provisioned) pod', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, reused: false })).toBe(false);
  });

  it('reseeds when this page-session never seeded the workspace (fresh load / cross-device)', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, seededThisSession: false })).toBe(false);
  });

  it('reseeds when there is no live preview port to adopt', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, hasLivePort: false })).toBe(false);
  });

  it('reseeds when project storage is known to be newer than the last seed', () => {
    expect(shouldReattachWarmWorkspace({ ...warm, storageNewerThanSeed: true })).toBe(false);
  });

  it('treats an unknown storage-freshness as safe (relies on the same-session marker)', () => {
    const { storageNewerThanSeed: _omit, ...withoutFreshness } = warm;
    expect(shouldReattachWarmWorkspace(withoutFreshness)).toBe(true);
  });
});
