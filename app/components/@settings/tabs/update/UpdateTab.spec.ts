import { describe, expect, it } from 'vitest';
import { isUpdateAvailable } from './UpdateTab';

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
