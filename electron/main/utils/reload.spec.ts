import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above module-level vars, so build the shared mocks with
// vi.hoisted to keep them in scope inside the factories and the tests alike.
const { appMock, devState, watchMock } = vi.hoisted(() => ({
  // electron's `app` is not available outside a real Electron runtime, so we stub the
  // pieces reload.ts touches. `getAppPath` returns a throwaway dir; relaunch/quit are spies.
  appMock: {
    getAppPath: vi.fn(() => '/tmp/reload-spec-app'),
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
  // `isDev` is the toggle under test. We override it per-test via a mutable holder.
  devState: { isDev: true },
  // Spy on fs.watch so we can assert whether the watcher is ever established.
  watchMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: appMock,
}));

vi.mock('./constants', () => ({
  get isDev() {
    return devState.isDev;
  },
  DEFAULT_PORT: 5173,
}));

vi.mock('node:fs', () => ({
  promises: {
    watch: watchMock,
  },
}));

import { reloadOnChange } from './reload';

describe('reloadOnChange', () => {
  beforeEach(() => {
    watchMock.mockReset();
    appMock.getAppPath.mockClear();
    appMock.relaunch.mockClear();
    appMock.quit.mockClear();
  });

  afterEach(() => {
    devState.isDev = true;
  });

  it('does not watch the app directory in production (isDev === false)', async () => {
    devState.isDev = false;

    await reloadOnChange();

    // The guard must short-circuit before establishing any watcher, so a stray write
    // under the packaged app dir can never relaunch the running app.
    expect(watchMock).not.toHaveBeenCalled();
    expect(appMock.relaunch).not.toHaveBeenCalled();
    expect(appMock.quit).not.toHaveBeenCalled();
  });

  it('establishes the dev watcher when isDev === true', async () => {
    devState.isDev = true;

    // Make the async iterator complete immediately with no events so the call resolves.
    watchMock.mockReturnValue(
      (async function* () {
        // no events
      })(),
    );

    await reloadOnChange();

    expect(watchMock).toHaveBeenCalledTimes(1);
    // Watches the build/electron dir recursively under the app path.
    const [watchedDir, options] = watchMock.mock.calls[0];
    expect(watchedDir).toContain('build');
    expect(watchedDir).toContain('electron');
    expect(options).toMatchObject({ recursive: true });
  });
});
