import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `app.getName()` is the only Electron surface the pure helpers touch. A mutable
 * spy lets each test drive the packaged-productName vs codename-fallback paths.
 */
const { appMock } = vi.hoisted(() => ({
  appMock: {
    getName: vi.fn(() => 'E-Code'),
    getAppPath: vi.fn(() => '/app'),
    on: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: class {},
  Notification: class {},
  Tray: class {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
  nativeImage: { createEmpty: vi.fn(), createFromPath: vi.fn() },
  session: {},
  shell: {},
}));

vi.mock('electron-log', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('../utils/store', () => ({
  store: { get: vi.fn(), set: vi.fn() },
}));

import { brandName, defaultExportFileName, trayIconCandidates } from './native-services.js';

afterEach(() => {
  vi.clearAllMocks();
  appMock.getName.mockReturnValue('E-Code');
});

describe('trayIconCandidates', () => {
  it('prefers bundled (build/ and assets/) locations over the dev-only public/ path', () => {
    const candidates = trayIconCandidates('/app');

    expect(candidates[0]).toBe('/app/build/client/favicon.ico');
    expect(candidates).toContain('/app/assets/icons/icon.ico');

    // The unbundled public/ path is allowed only as a last-resort dev fallback.
    const publicIdx = candidates.indexOf('/app/public/favicon.ico');
    expect(publicIdx).toBe(candidates.length - 1);
  });
});

describe('brandName', () => {
  it('uses the packaged productName when it is set to a real brand', () => {
    appMock.getName.mockReturnValue('E-Code');
    expect(brandName()).toBe('E-Code');
  });

  it('never leaks the internal codename, even if app.getName() returns it', () => {
    appMock.getName.mockReturnValue('VibeCore');
    expect(brandName()).toBe('E-Code');
  });

  it('falls back to the brand when app.getName() is the Electron default', () => {
    appMock.getName.mockReturnValue('Electron');
    expect(brandName()).toBe('E-Code');
  });

  it('falls back to the brand when app.getName() throws', () => {
    appMock.getName.mockImplementation(() => {
      throw new Error('app not ready');
    });
    expect(brandName()).toBe('E-Code');
  });
});

describe('defaultExportFileName', () => {
  it('derives a brand-correct Save-dialog filename, never the internal codename', () => {
    appMock.getName.mockReturnValue('E-Code');

    const name = defaultExportFileName();

    expect(name).toBe('e-code-project.zip');
    expect(name).not.toContain('vibecore');
  });

  it('never leaks the internal codename even if app.getName() returns it', () => {
    appMock.getName.mockReturnValue('VibeCore');

    // brandName() rejects the codename and falls back to the 'E-Code' literal.
    expect(defaultExportFileName()).toBe('e-code-project.zip');
    expect(defaultExportFileName()).not.toContain('vibecore');
  });

  it('slugifies a packaged productName into a filesystem-safe basename', () => {
    appMock.getName.mockReturnValue('My Cool App!');
    expect(defaultExportFileName()).toBe('my-cool-app-project.zip');
  });
});
