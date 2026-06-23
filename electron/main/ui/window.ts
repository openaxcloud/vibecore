import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { isDev } from '../utils/constants';
import { store } from '../utils/store';
import { isSameOrigin } from './origin';

export function createWindow(rendererURL: string) {
  console.log('Creating window with URL:', rendererURL);

  const bounds = store.get('bounds');
  console.log('restored bounds:', bounds);

  // preload path
  const preloadPath = path.join(isDev ? process.cwd() : app.getAppPath(), 'build', 'electron', 'preload', 'index.cjs');

  const win = new BrowserWindow({
    ...{
      width: 1200,
      height: 800,
      ...bounds,
    },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: preloadPath,
    },
  });

  console.log('Window created, loading URL...');
  win.loadURL(rendererURL).catch((err) => {
    console.log('Failed to load URL:', err);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.log('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
  });

  /*
   * Lock down navigation: the preload bridge exposes privileged APIs (auth-token
   * getter, native file dialogs) to whatever page occupies the window, so only
   * the app's own localhost origin may load in-window; everything else opens in
   * the user's default browser and new windows are blocked. Without this a
   * hijacked navigation/redirect/window.open could carry the bridge to an
   * attacker origin and exfiltrate the auth token.
   *
   * The match is against the app's exact origin (scheme + host + port) derived
   * from rendererURL. Matching the bare hostname (localhost/127.0.0.1 on ANY
   * port) is NOT sufficient: in-app preview/dev servers and AI-generated user
   * apps run on other localhost ports, and any of those could otherwise inherit
   * the privileged bridge and read the auth token.
   */
  const isAllowedOrigin = (target: string): boolean => isSameOrigin(target, rendererURL);

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedOrigin(navigationUrl)) {
      event.preventDefault();
      shell.openExternal(navigationUrl).catch(() => undefined);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedOrigin(url)) {
      return { action: 'allow' };
    }

    shell.openExternal(url).catch(() => undefined);

    return { action: 'deny' };
  });

  // Open devtools in development
  if (isDev) {
    win.webContents.openDevTools();
  }

  const boundsListener = () => {
    const bounds = win.getBounds();
    store.set('bounds', bounds);
  };
  win.on('moved', boundsListener);
  win.on('resized', boundsListener);

  return win;
}
