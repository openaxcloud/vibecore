import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, session, shell, Tray } from 'electron';
import log from 'electron-log';
import { store } from '../utils/store';

let tray: Tray | undefined;

/**
 * User-facing product brand. The internal codename is "VibeCore"; everything the
 * end user sees (OS notifications, tray tooltip) must use the E-Code brand. When a
 * packaged build sets a productName we prefer that, falling back to the literal.
 */
export function brandName(): string {
  try {
    const name = app.getName();

    /*
     * Electron defaults app.getName() to the codename/package name in some builds;
     * never surface the internal codename to the user.
     */
    if (name && name.toLowerCase() !== 'vibecore' && name.toLowerCase() !== 'electron') {
      return name;
    }
  } catch {
    // app may be unavailable in some test contexts — fall through to the brand literal.
  }

  return 'E-Code';
}

/**
 * Brand-correct default filename for the "Export Project" Save dialog. Derived
 * from {@link brandName} so a packaged build's productName flows through, while
 * never surfacing the internal codename. The result is a safe, lowercase,
 * filesystem-friendly basename ending in `.zip` (e.g. `ecode-project.zip`).
 */
export function defaultExportFileName(): string {
  const slug = brandName()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug || 'ecode'}-project.zip`;
}

/**
 * Ordered list of candidate tray-icon paths, most-preferred first.
 *
 * The repo's `public/` directory is NOT in the electron-builder `files` allowlist,
 * so `public/favicon.ico` does not exist in a packaged app. The Remix client build
 * copies `public/*` into `build/client/`, and both `build/**` and `icons/**` (and
 * the packaged `assets/icons/**`) are bundled. We therefore look in the bundled
 * locations first and only fall back to the dev-time `public/` path last.
 */
export function trayIconCandidates(appPath: string): string[] {
  return [
    path.join(appPath, 'build', 'client', 'favicon.ico'),
    path.join(appPath, 'assets', 'icons', 'icon.ico'),
    path.join(appPath, 'assets', 'icons', 'icon.png'),
    path.join(appPath, 'public', 'favicon.ico'),
  ];
}

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

    const result = owner
      ? await dialog.showSaveDialog(owner, {
          defaultPath: defaultPath ?? defaultExportFileName(),
          filters: [{ name: 'Zip archive', extensions: ['zip'] }],
        })
      : await dialog.showSaveDialog({
          defaultPath: defaultPath ?? defaultExportFileName(),
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
      title: input.title ?? brandName(),
      body: input.body ?? 'Workspace update',
    }).show();

    return { shown: true, supported: true };
  });

  ipcMain.handle('desktop:network:status', () => ({
    online: !!getWindow()?.webContents.getURL(),
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

  let image = nativeImage.createEmpty();
  let resolvedFrom: string | undefined;

  for (const candidate of trayIconCandidates(app.getAppPath())) {
    const candidateImage = nativeImage.createFromPath(candidate);

    if (!candidateImage.isEmpty()) {
      image = candidateImage;
      resolvedFrom = candidate;
      break;
    }
  }

  if (!resolvedFrom) {
    // A blank tray icon is unclickable/invisible on Windows & Linux — surface why.
    log.warn(
      `[tray] no bundled tray icon found; tray will be invisible. Looked in: ${trayIconCandidates(
        app.getAppPath(),
      ).join(', ')}`,
    );
  }

  tray = new Tray(image);
  tray.setToolTip(brandName());
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
