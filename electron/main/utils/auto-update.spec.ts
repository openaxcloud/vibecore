import { describe, expect, it } from 'vitest';

// electron-updater / electron's `app` are not available outside a real Electron runtime, so
// stub the bits the module touches at import time. We only exercise the pure dialog builder.
import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '0.0.0') },
  dialog: { showMessageBox: vi.fn() },
}));

vi.mock('electron-updater', () => ({
  default: { autoUpdater: { on: vi.fn(), transports: {}, checkForUpdates: vi.fn() } },
}));

vi.mock('electron-log', () => ({
  default: { transports: { file: {} }, info: vi.fn(), error: vi.fn() },
}));

vi.mock('./constants', () => ({ isDev: false }));

import { buildUpdateErrorDialog } from './auto-update';

describe('buildUpdateErrorDialog', () => {
  it('produces a non-fatal warning dialog the user can dismiss', () => {
    const opts = buildUpdateErrorDialog(new Error('signature verification failed'));

    // A single dismiss button keeps it non-fatal/recoverable (no crash, no Restart prompt).
    expect(opts.buttons).toEqual(['OK']);
    expect(opts.type).toBe('warning');
    expect(opts.message).toBe('Update Failed');
  });

  it('makes clear the update was NOT installed so the user is not left believing it is in progress', () => {
    const opts = buildUpdateErrorDialog(new Error('ENOTFOUND github.com'));

    expect(opts.detail).toMatch(/not installed/i);
    expect(opts.detail).toMatch(/try again later/i);
    // Surfaces the underlying error so the failure is visible/diagnosable.
    expect(opts.detail).toContain('ENOTFOUND github.com');
  });

  it('handles non-Error throwables without crashing', () => {
    const opts = buildUpdateErrorDialog('plain string failure');

    expect(opts.detail).toContain('plain string failure');
  });
});
