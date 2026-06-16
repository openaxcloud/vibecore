import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, session, shell, Tray } from 'electron';
import path from 'node:path';
import log from 'electron-log';
import { store } from '../utils/store';

let tray: Tray | undefined;

export function setupNativeDesktopServices(getWindow: () => BrowserWindow | undefined) {
  ipcMain.handle('desktop:file:import', async () => {
    const owner = getWindow();
    const options = {
      properties: ['openFile'],
      filters: [
        { name: 'Archives', extensions: ['zip'] },
        { name: 'All files', extensions: ['*'] },
      ],
    } as Electron.OpenDialogOptions;
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('desktop:file:export', async (_event, defaultPath?: string) => {
    const owner = getWindow();
    const result = owner ? await dialog.showSaveDialog(owner, {
      defaultPath: defaultPath ?? 'vibecore-project.zip',
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    }) : await dialog.showSaveDialog({
      defaultPath: defaultPath ?? 'vibecore-project.zip',
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });

    return result.canceled ? undefined : result.filePath;
  });

  ipcMain.handle('desktop:folder:open', async () => {
    const owner = getWindow();
    const result = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });

    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle('desktop:notification:show', (_event, input: { title?: string; body?: string }) => {
    if (!Notification.isSupported()) {
      return { shown: false, supported: false };
    }

    new Notification({
      title: input.title ?? 'VibeCore',
      body: input.body ?? 'Workspace update',
    }).show();

    return { shown: true, supported: true };
  });

  ipcMain.handle('desktop:network:status', () => ({
    online: getWindow()?.webContents.getURL() ? true : false,
    lastCheckedAt: new Date().toISOString(),
  }));

  ipcMain.handle('desktop:settings:get', () => ({
    proxy: store.get('desktop.proxy') ?? { mode: 'system' },
    trayEnabled: store.get('desktop.trayEnabled') ?? false,
    devicePolicy: store.get('desktop.devicePolicy') ?? { managed: false, source: 'placeholder' },
  }));

  ipcMain.handle('desktop:settings:set', async (_event, settings: any) => {
    if (settings.proxy) {
      store.set('desktop.proxy', settings.proxy);

      /*
       * Actually APPLY the chosen proxy to the session — the old handler only
       * persisted it and unconditionally forced DNS to 'automatic', so the
       * user's System/Direct/Manual choice never took effect.
       */
      try {
        const mode = settings.proxy.mode ?? 'system';

        if (mode === 'manual' && typeof settings.proxy.server === 'string' && settings.proxy.server.trim()) {
          await session.defaultSession.setProxy({ proxyRules: settings.proxy.server.trim() });
        } else if (mode === 'direct') {
          await session.defaultSession.setProxy({ mode: 'direct' });
        } else {
          await session.defaultSession.setProxy({ mode: 'system' });
        }
      } catch (error) {
        log.warn(error);
      }
    }

    if (typeof settings.trayEnabled === 'boolean') {
      store.set('desktop.trayEnabled', settings.trayEnabled);
      settings.trayEnabled ? ensureTray(getWindow) : destroyTray();
    }

    if (settings.devicePolicy) {
      store.set('desktop.devicePolicy', settings.devicePolicy);
    }

    return { ok: true };
  });

  if (store.get('desktop.trayEnabled')) {
    ensureTray(getWindow);
  }

  app.on('before-quit', destroyTray);
}

function ensureTray(getWindow: () => BrowserWindow | undefined) {
  if (tray) {
    return;
  }

  const iconPath = path.join(app.getAppPath(), 'public', 'favicon.ico');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('VibeCore');
  tray.on('click', () => {
    const win = getWindow();
    win?.show();
    win?.focus();
  });
}

function destroyTray() {
  tray?.destroy();
  tray = undefined;
}

export function openExternalUrl(url: string) {
  return shell.openExternal(url);
}
