import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  debounce,
  openDesktopLocalFolder,
  saveDesktopSettings,
  showDesktopTestNotification,
} from './desktop-settings-actions';

type Bridge = NonNullable<typeof globalThis.window.vibecoreDesktop>;

function makeBridge(
  overrides: Partial<{
    settingsSet: () => Promise<unknown>;
    notificationsShow: () => Promise<unknown>;
    openLocalFolder: () => Promise<string | undefined>;
  }> = {},
): Bridge {
  return {
    auth: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
    files: {
      importZip: vi.fn(),
      exportZip: vi.fn(),
      openLocalFolder: overrides.openLocalFolder ?? vi.fn(async () => '/tmp/project'),
    },
    notifications: { show: overrides.notificationsShow ?? vi.fn(async () => ({ shown: true, supported: true })) },
    settings: { get: vi.fn(), set: overrides.settingsSet ?? vi.fn(async () => ({ ok: true })) },
    network: { status: vi.fn() },
    crashReporting: { status: vi.fn() },
    onDeepLink: vi.fn(),
    onMenuAction: vi.fn(),
  } as unknown as Bridge;
}

describe('saveDesktopSettings', () => {
  it('returns staged message when bridge is missing', async () => {
    expect(await saveDesktopSettings(undefined, { a: 1 })).toBe('desktopSettings.status.openAppSettings');
  });

  it('persists and returns saved status on success', async () => {
    const set = vi.fn(async () => ({ ok: true }));
    const bridge = makeBridge({ settingsSet: set });
    expect(await saveDesktopSettings(bridge, { a: 1 })).toBe('desktopSettings.status.saved');
    expect(set).toHaveBeenCalledWith({ a: 1 });
  });

  it('returns safe customer copy instead of a system error when settings.set fails', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw new Error('disk write failed');
      },
    });
    await expect(saveDesktopSettings(bridge, { a: 1 })).resolves.toBe('desktopSettings.status.saveFailed');
  });

  it('does not stringify non-Error rejections into the interface', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw 'nope';
      },
    });
    await expect(saveDesktopSettings(bridge, {})).resolves.toBe('desktopSettings.status.saveFailed');
  });
});

describe('showDesktopTestNotification', () => {
  it('returns a desktop-app message when the bridge is missing', async () => {
    expect(await showDesktopTestNotification(undefined)).toBe('desktopSettings.status.openAppNotification');
  });

  it('returns sent status on success', async () => {
    expect(await showDesktopTestNotification(makeBridge())).toBe('desktopSettings.status.notificationSent');
  });

  it('turns permission errors into safe actionable copy', async () => {
    const bridge = makeBridge({
      notificationsShow: async () => {
        throw new Error('permission denied');
      },
    });
    await expect(showDesktopTestNotification(bridge)).resolves.toBe('desktopSettings.status.notificationFailed');
  });

  it('sends a localized body without translating the E-Code brand', async () => {
    const notificationsShow = vi.fn(async () => ({ shown: true, supported: true }));
    const bridge = makeBridge({ notificationsShow });

    await expect(showDesktopTestNotification(bridge, 'fr')).resolves.toBe('desktopSettings.status.notificationSent');
    expect(notificationsShow).toHaveBeenCalledWith({
      title: 'E-Code',
      body: 'Les notifications natives sont activées.',
    });
  });
});

describe('openDesktopLocalFolder', () => {
  it('returns a desktop-app message when the bridge is missing', async () => {
    expect(await openDesktopLocalFolder(undefined)).toBe('desktopSettings.status.openAppFolder');
  });

  it('returns selected folder on success', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => '/home/user/app' });
    expect(await openDesktopLocalFolder(bridge)).toBe('desktopSettings.status.folderSelected');
  });

  it('returns canceled status when no folder chosen', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => undefined });
    expect(await openDesktopLocalFolder(bridge)).toBe('desktopSettings.status.folderCanceled');
  });

  it('does not expose dialog errors to the interface', async () => {
    const bridge = makeBridge({
      openLocalFolder: async () => {
        throw new Error('dialog error');
      },
    });
    await expect(openDesktopLocalFolder(bridge)).resolves.toBe('desktopSettings.status.folderFailed');
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once with the latest args after the delay', () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() drops a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
  });
});
