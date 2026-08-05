// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const addListener = vi.fn();
const requestPermissions = vi.fn();
const register = vi.fn();
const share = vi.fn();

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: (...args: unknown[]) => addListener(...args),
    requestPermissions: (...args: unknown[]) => requestPermissions(...args),
    register: (...args: unknown[]) => register(...args),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: (...args: unknown[]) => share(...args),
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: () => Promise.resolve() },
  ImpactStyle: { Light: 'LIGHT' },
}));

import { configurePushNotifications, handleDeepLink, runCleanup, shareProjectLink } from './native';

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

describe('shareProjectLink (native share payload uses the E-Code brand)', () => {
  beforeEach(() => {
    share.mockReset();
    share.mockResolvedValue(undefined);
  });

  it('shares the E-Code brand and never leaks the internal codename', async () => {
    await shareProjectLink('project_123', 'https://app.e-code.ai/projects/project_123');

    expect(share).toHaveBeenCalledTimes(1);

    const payload = share.mock.calls[0][0] as { title: string; text: string; url: string; dialogTitle: string };

    expect(payload.title).toBe('E-Code project');
    expect(payload.text).toBe('Open project project_123 on E-Code');
    expect(payload.url).toBe('https://app.e-code.ai/projects/project_123');

    // Regression guard: no Vibecore/Bolt codename surfaced to the OS share sheet or recipient.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/vibecore|bolt/i);
  });

  it('localizes the native share sheet in French while preserving the project id and URL', async () => {
    await shareProjectLink('project_123', 'https://app.e-code.ai/projects/project_123', 'fr-FR');

    const payload = share.mock.calls[0][0] as { title: string; text: string; url: string; dialogTitle: string };

    expect(payload).toEqual({
      title: 'Projet E-Code',
      text: 'Ouvrir le projet project_123 sur E-Code',
      url: 'https://app.e-code.ai/projects/project_123',
      dialogTitle: 'Partager le projet',
    });
  });
});

describe('configurePushNotifications (permission/register rejection does not leak listeners)', () => {
  beforeEach(() => {
    addListener.mockReset();
    requestPermissions.mockReset();
    register.mockReset();
  });

  it('removes the three listeners and re-throws when requestPermissions rejects mid-bootstrap', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    addListener.mockResolvedValue({ remove });
    requestPermissions.mockRejectedValue(new Error('denied/restricted'));

    await expect(configurePushNotifications()).rejects.toThrow('denied/restricted');

    // All three listeners (registration, registrationError, action) were added...
    expect(addListener).toHaveBeenCalledTimes(3);

    /*
     * ...and all three were torn down before the rejection propagated, so they
     * do not leak when bootstrapMobileApp's `cleanup.push(await ...)` is skipped.
     */
    expect(remove).toHaveBeenCalledTimes(3);
    expect(register).not.toHaveBeenCalled();
  });

  it('removes the three listeners and re-throws when register() rejects after permission granted', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    addListener.mockResolvedValue({ remove });
    requestPermissions.mockResolvedValue({ receive: 'granted' });
    register.mockRejectedValue(new Error('APNs registration failed'));

    await expect(configurePushNotifications()).rejects.toThrow('APNs registration failed');

    expect(addListener).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('returns a dispose that removes the three listeners on the happy path', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    addListener.mockResolvedValue({ remove });
    requestPermissions.mockResolvedValue({ receive: 'granted' });
    register.mockResolvedValue(undefined);

    const dispose = await configurePushNotifications();

    // Not removed yet — the listeners are live until dispose runs.
    expect(remove).not.toHaveBeenCalled();

    await dispose();

    expect(remove).toHaveBeenCalledTimes(3);
  });
});
