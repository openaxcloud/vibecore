import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Records the windows handed to the mocked `BrowserWindow` so `getAllWindows()`
 * can answer with whatever the test created. Hoisted so the (hoisted) `vi.mock`
 * factory can reference it.
 */
const { allWindows } = vi.hoisted(() => ({ allWindows: [] as any[] }));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => allWindows,
  },
  Menu: { getApplicationMenu: vi.fn(), setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

import { buildRouteURL, resolveLiveWindow } from './menu';

/** A fake window with a toggleable destroyed flag, mirroring Electron's API. */
function fakeWindow(destroyed = false) {
  return { isDestroyed: () => destroyed } as any;
}

beforeEach(() => {
  allWindows.length = 0;
});

describe('resolveLiveWindow', () => {
  it('returns a live captured window as-is', () => {
    const win = fakeWindow(false);
    expect(resolveLiveWindow(win)).toBe(win);
  });

  it('invokes a getter so it tracks window recreation', () => {
    const win = fakeWindow(false);
    expect(resolveLiveWindow(() => win)).toBe(win);
  });

  it('falls back to the current live window when the captured one is destroyed', () => {
    // macOS close+reopen: the startup window is destroyed but a new one exists.
    const destroyed = fakeWindow(true);
    const recreated = fakeWindow(false);
    allWindows.push(recreated);

    /*
     * A *destroyed* BrowserWindow object is still truthy, so optional-chaining
     * alone would not have saved us — this is the bug-1 regression guard.
     */
    expect(resolveLiveWindow(destroyed)).toBe(recreated);
  });

  it('falls back when a getter returns a destroyed window', () => {
    const destroyed = fakeWindow(true);
    const recreated = fakeWindow(false);
    allWindows.push(recreated);

    expect(resolveLiveWindow(() => destroyed)).toBe(recreated);
  });

  it('falls back when a getter returns nothing (window not yet recreated)', () => {
    const recreated = fakeWindow(false);
    allWindows.push(recreated);

    expect(resolveLiveWindow(() => undefined)).toBe(recreated);
  });

  it('skips destroyed windows when scanning for a live fallback', () => {
    const destroyedA = fakeWindow(true);
    const live = fakeWindow(false);
    allWindows.push(destroyedA, live);

    expect(resolveLiveWindow(undefined as any)).toBe(live);
  });

  it('returns undefined when no live window exists anywhere', () => {
    allWindows.push(fakeWindow(true));
    expect(resolveLiveWindow(fakeWindow(true))).toBeUndefined();
  });
});

describe('buildRouteURL', () => {
  it('uses the live renderer port instead of a hardcoded 5173', () => {
    /*
     * bug-1 regression guard: Vite auto-increments the port (strictPort:false)
     * when 5173 is busy, so the window may live on 5174+.
     */
    expect(buildRouteURL('http://localhost:5174', '/dashboard')).toBe('http://localhost:5174/dashboard');
  });

  it('honours the production default port', () => {
    expect(buildRouteURL('http://localhost:3000', '/desktop-settings')).toBe('http://localhost:3000/desktop-settings');
  });

  it('preserves the renderer protocol and host (not just the port)', () => {
    expect(buildRouteURL('http://127.0.0.1:5173', '/projects')).toBe('http://127.0.0.1:5173/projects');
  });

  it('resolves the route as an absolute path, ignoring any path in the origin', () => {
    // An origin may carry a trailing path; route paths are absolute and replace it.
    expect(buildRouteURL('http://localhost:5174/some/base', '/projects')).toBe('http://localhost:5174/projects');
  });
});
