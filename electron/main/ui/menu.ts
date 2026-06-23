import { BrowserWindow, Menu, shell } from 'electron';

/** Public E-Code documentation (brand-sweep canonical, no internal codename / `.local` host). */
const DOCS_URL = 'https://e-code.ai/docs';

/**
 * Accepts either the (legacy) literal window or a live getter. A getter lets the
 * menu track window recreation on macOS, where closing the window destroys it
 * but keeps the process alive (`window-all-closed` does not quit), and a later
 * dock re-activate builds a brand-new `mainWindow`.
 */
export type WindowSource = BrowserWindow | (() => BrowserWindow | null | undefined);

/**
 * Resolve the window the menu should act on, *at click time*.
 *
 * The menu is built once at startup, so any window captured then may have been
 * destroyed (close+reopen on macOS) by the time a menu item fires. We therefore
 * never act on a stale reference:
 *   - a getter is re-invoked so it returns the current `mainWindow`;
 *   - a captured window is used only while live;
 *   - in either case, if the resolved window is missing/destroyed we fall back
 *     to any live BrowserWindow (the one rebuilt on dock re-activate).
 *
 * Returns a usable, non-destroyed window, or `undefined` when none exists.
 */
export function resolveLiveWindow(source: WindowSource): BrowserWindow | undefined {
  const candidate = typeof source === 'function' ? source() : source;

  if (candidate && !candidate.isDestroyed()) {
    return candidate;
  }

  /*
   * The captured/returned window is gone (e.g. closed then reopened on macOS):
   * act on the current live window instead of throwing "Object has been destroyed".
   */
  const live = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  return live ?? undefined;
}

/**
 * Build an absolute renderer URL for a route `path` against the *live* renderer
 * `origin` (the one `index.ts` actually loaded the window on).
 *
 * The origin must be threaded in rather than hardcoded: in dev the Vite server
 * uses a non-strict port (`strictPort: false`), so a busy 5173 silently becomes
 * 5174+, and in prod it is `DEFAULT_PORT`. A literal `http://localhost:5173`
 * navigated the window to a dead origin (blank/`did-fail-load`) whenever those
 * differed. We resolve `path` relative to `origin` so the host/port/protocol
 * always match the window's real renderer, while keeping the route path intact.
 */
export function buildRouteURL(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

export function setupMenu(windowSource: WindowSource, rendererURL: string): void {
  /** Load a renderer route on whichever window is currently live. */
  const loadOnLiveWindow = (path: string) => {
    const win = resolveLiveWindow(windowSource);
    win?.loadURL(buildRouteURL(rendererURL, path)).catch(() => undefined);
  };

  /** Send a menu action IPC to whichever window is currently live. */
  const sendToLiveWindow = (action: string) => {
    const win = resolveLiveWindow(windowSource);
    win?.webContents.send('desktop:menu-action', action);
  };

  const currentMenu = Menu.getApplicationMenu();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(currentMenu ? currentMenu.items : []),
      {
        label: 'E-Code',
        submenu: [
          {
            label: 'Desktop Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => loadOnLiveWindow('/desktop-settings'),
          },
          { type: 'separator' },
          {
            label: 'Open Dashboard',
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => loadOnLiveWindow('/dashboard'),
          },
          {
            label: 'Open Projects',
            accelerator: 'CmdOrCtrl+Shift+P',
            click: () => loadOnLiveWindow('/projects'),
          },
          { type: 'separator' },
          {
            label: 'Documentation',
            click: () => shell.openExternal(DOCS_URL).catch(() => undefined),
          },
          { type: 'separator' },
          { role: 'quit', label: 'Quit E-Code' },
        ],
      },
      {
        label: 'Project',
        submenu: [
          {
            label: 'Import Zip',
            accelerator: 'CmdOrCtrl+O',
            click: () => sendToLiveWindow('import-zip'),
          },
          {
            label: 'Open Local Folder as Project',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: () => sendToLiveWindow('open-local-folder'),
          },
          {
            label: 'Export Project',
            accelerator: 'CmdOrCtrl+E',
            click: () => sendToLiveWindow('export-project'),
          },
        ],
      },
      {
        label: 'Go',
        submenu: [
          {
            label: 'Back',
            accelerator: 'CmdOrCtrl+[',
            click: () => {
              resolveLiveWindow(windowSource)?.webContents.navigationHistory.goBack();
            },
          },
          {
            label: 'Forward',
            accelerator: 'CmdOrCtrl+]',
            click: () => {
              resolveLiveWindow(windowSource)?.webContents.navigationHistory.goForward();
            },
          },
        ],
      },
    ]),
  );
}
