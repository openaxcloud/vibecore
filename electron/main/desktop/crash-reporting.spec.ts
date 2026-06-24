import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Crash reporting only touches `app.getName()` (via brandName) plus the
 * `crashReporter.start` payload. Mutable spies let each test assert that the
 * codename never leaks into the report metadata, even when app.getName()
 * resolves to the internal codename (as electron-builder.yml sets it).
 */
const { appMock, crashReporterMock, ipcMainMock } = vi.hoisted(() => ({
  appMock: {
    getName: vi.fn(() => 'E-Code'),
    getVersion: vi.fn(() => '1.2.3'),
    getPath: vi.fn(() => '/tmp/crashes'),
  },
  crashReporterMock: {
    start: vi.fn(),
  },
  ipcMainMock: {
    handle: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: appMock,
  crashReporter: crashReporterMock,
  ipcMain: ipcMainMock,

  // Pulled in transitively by native-services (brandName lives there).
  BrowserWindow: class {},
  Notification: class {},
  Tray: class {},
  dialog: {},
  nativeImage: { createEmpty: vi.fn(), createFromPath: vi.fn() },
  session: {},
  shell: {},
}));

vi.mock('electron-log', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

/*
 * crash-reporting imports brandName from native-services, which side-effect
 * imports the ElectronStore singleton; stub it so module load stays pure.
 */
vi.mock('../utils/store', () => ({
  store: { get: vi.fn(), set: vi.fn() },
}));

import { setupCrashReporting } from './crash-reporting.js';

afterEach(() => {
  vi.clearAllMocks();
  appMock.getName.mockReturnValue('E-Code');
  delete process.env.DESKTOP_CRASH_REPORT_URL;
});

describe('setupCrashReporting', () => {
  beforeEach(() => {
    delete process.env.DESKTOP_CRASH_REPORT_URL;
  });

  it('does not start the reporter when no submit URL is configured', () => {
    setupCrashReporting();
    expect(crashReporterMock.start).not.toHaveBeenCalled();
  });

  it('uses the E-Code brand for productName and companyName', () => {
    setupCrashReporting({ submitURL: 'https://crash.example.com/submit' });

    expect(crashReporterMock.start).toHaveBeenCalledTimes(1);

    const payload = crashReporterMock.start.mock.calls[0][0];
    expect(payload.productName).toBe('E-Code');
    expect(payload.companyName).toBe('E-Code');
  });

  it('never leaks the internal codename even when app.getName() returns it', () => {
    appMock.getName.mockReturnValue('VibeCore');

    setupCrashReporting({ submitURL: 'https://crash.example.com/submit' });

    const payload = crashReporterMock.start.mock.calls[0][0];
    expect(payload.productName).toBe('E-Code');
    expect(payload.companyName).toBe('E-Code');
    expect(JSON.stringify(payload)).not.toContain('VibeCore');
  });
});
