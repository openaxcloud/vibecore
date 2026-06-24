import { app, crashReporter, ipcMain } from 'electron';
import log from 'electron-log';
import { brandName } from './native-services.js';

export interface CrashReporterConfig {
  submitURL?: string;
  uploadToServer?: boolean;
}

export function setupCrashReporting(config: CrashReporterConfig = {}) {
  const submitURL = config.submitURL ?? process.env.DESKTOP_CRASH_REPORT_URL;

  if (!submitURL) {
    log.info('Crash reporting disabled: DESKTOP_CRASH_REPORT_URL is not configured.');
    return;
  }

  crashReporter.start({
    submitURL,
    uploadToServer: config.uploadToServer ?? true,
    productName: brandName(),
    companyName: brandName(),
    extra: {
      version: app.getVersion(),
      channel: process.env.DESKTOP_RELEASE_CHANNEL ?? 'local',
    },
  });

  ipcMain.handle('desktop:crash-reporting:status', () => ({
    enabled: true,
    reportsDirectory: app.getPath('crashDumps'),
  }));
}
