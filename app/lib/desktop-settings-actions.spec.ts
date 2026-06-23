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
    expect(await saveDesktopSettings(undefined, { a: 1 })).toMatch(/staged in this browser session/);
  });

  it('persists and returns saved status on success', async () => {
    const set = vi.fn(async () => ({ ok: true }));
    const bridge = makeBridge({ settingsSet: set });
    expect(await saveDesktopSettings(bridge, { a: 1 })).toBe('Desktop settings saved.');
    expect(set).toHaveBeenCalledWith({ a: 1 });
  });

  it('surfaces the error message instead of rejecting when settings.set fails', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw new Error('disk write failed');
      },
    });
    await expect(saveDesktopSettings(bridge, { a: 1 })).resolves.toBe('disk write failed');
  });

  it('stringifies non-Error rejections', async () => {
    const bridge = makeBridge({
      settingsSet: async () => {
        throw 'nope';
      },
    });
    await expect(saveDesktopSettings(bridge, {})).resolves.toBe('nope');
  });
});

describe('showDesktopTestNotification', () => {
  it('returns electron-required message when bridge missing', async () => {
    expect(await showDesktopTestNotification(undefined)).toMatch(/require Electron/);
  });

  it('returns sent status on success', async () => {
    expect(await showDesktopTestNotification(makeBridge())).toBe('Test notification sent.');
  });

  it('surfaces permission errors instead of rejecting', async () => {
    const bridge = makeBridge({
      notificationsShow: async () => {
        throw new Error('permission denied');
      },
    });
    await expect(showDesktopTestNotification(bridge)).resolves.toBe('permission denied');
  });
});

describe('openDesktopLocalFolder', () => {
  it('returns electron-required message when bridge missing', async () => {
    expect(await openDesktopLocalFolder(undefined)).toMatch(/requires Electron/);
  });

  it('returns selected folder on success', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => '/home/user/app' });
    expect(await openDesktopLocalFolder(bridge)).toBe('Folder selected: /home/user/app');
  });

  it('returns canceled status when no folder chosen', async () => {
    const bridge = makeBridge({ openLocalFolder: async () => undefined });
    expect(await openDesktopLocalFolder(bridge)).toBe('Folder selection canceled.');
  });

  it('surfaces dialog errors instead of rejecting', async () => {
    const bridge = makeBridge({
      openLocalFolder: async () => {
        throw new Error('dialog error');
      },
    });
    await expect(openDesktopLocalFolder(bridge)).resolves.toBe('dialog error');
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
