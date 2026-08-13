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
    expect(await saveDesktopSettings(undefined, { a: 1 })).toBe(
      'Open this page in the E-Code desktop app to change native settings.',
    );
  });

  it('persists and returns saved status on success', async () => {
    const set = vi.fn(async () => ({ ok: true }));
    const bridge = makeBridge({ settingsSet: set });
    expect(await saveDesktopSettings(bridge, { a: 1 })).toBe('Desktop settings saved.');
    expect(set).toHaveBeenCalledWith({ a: 1 });
  });

  it('returns safe customer copy instead of a system error when settings.set fails', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw new Error('disk write failed');
      },
    });
    await expect(saveDesktopSettings(bridge, { a: 1 })).resolves.toBe(
      'Desktop settings could not be saved. Try again.',
    );
  });

  it('does not stringify non-Error rejections into the interface', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw 'nope';
      },
    });
    await expect(saveDesktopSettings(bridge, {})).resolves.toBe('Desktop settings could not be saved. Try again.');
  });
});

describe('showDesktopTestNotification', () => {
  it('returns a desktop-app message when the bridge is missing', async () => {
    expect(await showDesktopTestNotification(undefined)).toBe(
      'Open this page in the E-Code desktop app to test native notifications.',
    );
  });

  it('returns sent status on success', async () => {
    expect(await showDesktopTestNotification(makeBridge())).toBe('Test notification sent.');
  });

  it('turns permission errors into safe actionable copy', async () => {
    const bridge = makeBridge({
      notificationsShow: async () => {
        throw new Error('permission denied');
      },
    });
    await expect(showDesktopTestNotification(bridge)).resolves.toBe(
      'The test notification could not be sent. Check system permissions and try again.',
    );
  });
});

describe('openDesktopLocalFolder', () => {
  it('returns a desktop-app message when the bridge is missing', async () => {
    expect(await openDesktopLocalFolder(undefined)).toBe(
      'Open this page in the E-Code desktop app to choose a local folder.',
    );
  });

  it('returns selected folder on success', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => '/home/user/app' });
    expect(await openDesktopLocalFolder(bridge)).toBe('Folder selected.');
  });

  it('returns canceled status when no folder chosen', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => undefined });
    expect(await openDesktopLocalFolder(bridge)).toBe('Folder selection canceled.');
  });

  it('does not expose dialog errors to the interface', async () => {
    const bridge = makeBridge({
      openLocalFolder: async () => {
        throw new Error('dialog error');
      },
    });
    await expect(openDesktopLocalFolder(bridge)).resolves.toBe('The folder picker could not open. Try again.');
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
