import { describe, expect, it } from 'vitest';
import { isUpdateAvailable, normalizeUpdateProgress } from './UpdateTab';

describe('isUpdateAvailable', () => {
  it('returns false when details is undefined', () => {
    expect(isUpdateAvailable(undefined)).toBe(false);
  });

  it('returns false when updateReady is not set (error/partial payload)', () => {
    expect(isUpdateAvailable({ currentCommit: 'abc', remoteCommit: 'abc' })).toBe(false);
  });

  it('returns false when updateReady is explicitly false', () => {
    expect(isUpdateAvailable({ updateReady: false })).toBe(false);
  });

  it('returns true only when the server confirms an update is ready', () => {
    expect(
      isUpdateAvailable({
        updateReady: true,
        compareUrl: 'https://github.com/openaxcloud/vibecore/compare/aaa...bbb',
        commitMessages: ['bbbbbbb fix things'],
      }),
    ).toBe(true);
  });
});

describe('normalizeUpdateProgress', () => {
  it('rejects non-object payloads and strips unsafe URLs and raw error copy', () => {
    expect(normalizeUpdateProgress(null)).toBeNull();

    expect(
      normalizeUpdateProgress({
        stage: 'complete',
        progress: 140,
        error: 'Private upstream details',
        details: {
          updateReady: true,
          compareUrl: 'javascript:alert(1)',
          changedFiles: ['src/App.tsx'],
        },
      }),
    ).toEqual({
      stage: 'complete',
      progress: 100,
      failed: true,
      details: {
        additions: undefined,
        changedFiles: ['src/App.tsx'],
        changelog: undefined,
        commitMessages: undefined,
        compareUrl: undefined,
        currentCommit: undefined,
        deletions: undefined,
        remoteCommit: undefined,
        updateReady: true,
      },
    });
  });
});
