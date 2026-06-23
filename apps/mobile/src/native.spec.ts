// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { handleDeepLink, runCleanup } from './native';

describe('handleDeepLink (cold-start + appUrlOpen routing)', () => {
  it('dispatches the runtime event and invokes the callback for a supported launch URL', () => {
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener('vibecore:mobile-deep-link', listener);

    const onDeepLink = vi.fn();
    const result = handleDeepLink('vibecore://projects/project_123/ide?panel=security', onDeepLink);

    window.removeEventListener('vibecore:mobile-deep-link', listener);

    expect(result?.toString()).toBe('vibecore://projects/project_123/ide?panel=security');
    expect(onDeepLink).toHaveBeenCalledTimes(1);
    expect(onDeepLink.mock.calls[0][0].toString()).toBe('vibecore://projects/project_123/ide?panel=security');
    expect(events).toEqual([{ url: 'vibecore://projects/project_123/ide?panel=security' }]);
  });

  it('ignores unsupported launch URLs without dispatching or calling back', () => {
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener('vibecore:mobile-deep-link', listener);

    const onDeepLink = vi.fn();
    const result = handleDeepLink('ftp://example.com/x', onDeepLink);

    window.removeEventListener('vibecore:mobile-deep-link', listener);

    expect(result).toBeUndefined();
    expect(onDeepLink).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });
});

describe('runCleanup (failed-bootstrap teardown does not leak listeners)', () => {
  it('drains and runs every dispose callback', async () => {
    const calls: string[] = [];
    const cleanup = [() => void calls.push('a'), async () => void calls.push('b'), () => void calls.push('c')];

    await runCleanup(cleanup);

    expect(calls).toEqual(['a', 'b', 'c']);
    // Drained so a later cleanup() does not double-dispose.
    expect(cleanup).toHaveLength(0);
  });

  it('keeps removing the remaining listeners when one teardown throws', async () => {
    const calls: string[] = [];
    const cleanup = [
      () => void calls.push('first'),
      () => {
        throw new Error('teardown failed');
      },
      () => void calls.push('third'),
    ];

    await expect(runCleanup(cleanup)).resolves.toBeUndefined();

    expect(calls).toEqual(['first', 'third']);
  });
});
