import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Minimal Electron `app` double that records event handlers so the test can
 * drive the lifecycle (`browser-window-created` → `did-finish-load`) the way
 * the real runtime would on a macOS cold start. Defined via `vi.hoisted` so it
 * is initialized before the (hoisted) `vi.mock` factory references it.
 */
const { appHandlers, appMock } = vi.hoisted(() => {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {};

  return {
    appHandlers: handlers,
    appMock: {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        (handlers[event] ??= []).push(handler);
      }),
      setAsDefaultProtocolClient: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: class {},
}));

vi.mock('electron-log', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { getPendingDeepLink, parseDeepLinkTarget, setupDeepLinks } from './deep-links';

function emit(event: string, ...args: any[]) {
  for (const handler of appHandlers[event] ?? []) {
    handler(...args);
  }
}

/** A fake window whose `did-finish-load` callback can be fired on demand. */
function createFakeWindow() {
  const finishLoadCallbacks: (() => void)[] = [];
  const win = {
    isDestroyed: () => false,
    webContents: {
      send: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'did-finish-load') {
          finishLoadCallbacks.push(cb);
        }
      }),
    },
    loadURL: vi.fn().mockResolvedValue(undefined),
  };

  return {
    win,
    fireDidFinishLoad: () => finishLoadCallbacks.forEach((cb) => cb()),
  };
}

beforeEach(() => {
  for (const key of Object.keys(appHandlers)) {
    delete appHandlers[key];
  }

  appMock.on.mockClear();
  appMock.setAsDefaultProtocolClient.mockClear();
});

describe('parseDeepLinkTarget', () => {
  it('maps host-based project links to the IDE route', () => {
    expect(parseDeepLinkTarget('vibecore://project/abc123')).toBe(
      'http://localhost:5173/projects/abc123/ide',
    );
  });

  it('maps path-based project links to the IDE route', () => {
    expect(parseDeepLinkTarget('vibecore:///project/abc123')).toBe(
      'http://localhost:5173/projects/abc123/ide',
    );
  });

  it('maps workspace links to the IDE route', () => {
    expect(parseDeepLinkTarget('vibecore://workspace/ws-42')).toBe(
      'http://localhost:5173/projects/ws-42/ide',
    );
  });

  it('url-encodes the id', () => {
    // `@` is reserved in a path segment and must be percent-encoded in the route.
    expect(parseDeepLinkTarget('vibecore://project/a@b')).toBe(
      'http://localhost:5173/projects/a%40b/ide',
    );
  });

  it('returns undefined for unknown targets and malformed urls', () => {
    expect(parseDeepLinkTarget('vibecore://project')).toBeUndefined();
    expect(parseDeepLinkTarget('vibecore://other/1')).toBeUndefined();
    expect(parseDeepLinkTarget('not a url')).toBeUndefined();
  });
});

describe('setupDeepLinks cold-start replay', () => {
  it('replays a deep link captured before the window existed', () => {
    // Window does not exist yet (macOS cold start): open-url fires first.
    let mainWindow: any;
    setupDeepLinks(() => mainWindow);

    emit('open-url', { preventDefault: vi.fn() }, 'vibecore://project/cold123');

    // The link was stashed because there was no window to deliver it to.
    expect(getPendingDeepLink()).toBe('vibecore://project/cold123');

    // Later, index.ts creates the window.
    const { win, fireDidFinishLoad } = createFakeWindow();
    mainWindow = win;
    emit('browser-window-created', { preventDefault: vi.fn() }, win);

    // Nothing replayed until the renderer has actually loaded.
    expect(win.loadURL).not.toHaveBeenCalled();

    fireDidFinishLoad();

    // The pending link is now delivered to the renderer and navigated.
    expect(win.webContents.send).toHaveBeenCalledWith('desktop:deep-link', 'vibecore://project/cold123');
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173/projects/cold123/ide');

    // And it is cleared so it is not replayed again on a future load/window.
    expect(getPendingDeepLink()).toBeUndefined();
  });

  it('does not replay anything when there is no pending deep link', () => {
    let mainWindow: any;
    setupDeepLinks(() => mainWindow);

    const { win, fireDidFinishLoad } = createFakeWindow();
    mainWindow = win;
    emit('browser-window-created', { preventDefault: vi.fn() }, win);
    fireDidFinishLoad();

    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(win.loadURL).not.toHaveBeenCalled();
  });
});
