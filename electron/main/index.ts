/// <reference types="vite/client" />
import path from 'node:path';
import electron, { app, BrowserWindow, protocol, session } from 'electron';
import log from 'electron-log';
import { createRequestHandler } from 'react-router';
import * as pkg from '../../package.json';
import { setupDesktopAuthIpc } from './desktop/auth';
import { setupCrashReporting } from './desktop/crash-reporting';
import { setupDeepLinks } from './desktop/deep-links';
import { setupNativeDesktopServices } from './desktop/native-services';
import { setupMenu } from './ui/menu';
import { createWindow } from './ui/window';
import { setupAutoUpdater } from './utils/auto-update';
import { isDev, DEFAULT_PORT } from './utils/constants';
import { initCookies, storeCookies } from './utils/cookie';
import { appOriginCookieFilter, createCookieSnapshot, diffCookies, recordCookies } from './utils/cookie-sync';
import { reloadOnChange } from './utils/reload';
import { loadServerBuild, serveAsset } from './utils/serve';
import { initViteServer, viteServer } from './utils/vite-server';

Object.assign(console, log.functions);

console.debug('main: import.meta.env:', import.meta.env);
console.log('main: isDev:', isDev);
console.log('NODE_ENV:', global.process.env.NODE_ENV);
console.log('isPackaged:', app.isPackaged);

// Log unhandled errors
process.on('uncaughtException', async (error) => {
  console.log('Uncaught Exception:', error);
});

process.on('unhandledRejection', async (error) => {
  console.log('Unhandled Rejection:', error);
});

(() => {
  const root = global.process.env.APP_PATH_ROOT ?? import.meta.env.VITE_APP_PATH_ROOT;

  if (root === undefined) {
    console.log('no given APP_PATH_ROOT or VITE_APP_PATH_ROOT. default path is used.');
    return;
  }

  if (!path.isAbsolute(root)) {
    console.log('APP_PATH_ROOT must be absolute path.');
    global.process.exit(1);
  }

  console.log(`APP_PATH_ROOT: ${root}`);

  const subdirName = pkg.name;

  for (const [key, val] of [
    ['appData', ''],
    ['userData', subdirName],
    ['sessionData', subdirName],
  ] as const) {
    app.setPath(key, path.join(root, val));
  }

  app.setAppLogsPath(path.join(root, subdirName, 'Logs'));
})();

console.log('appPath:', app.getAppPath());

const keys: Parameters<typeof app.getPath>[number][] = ['home', 'appData', 'userData', 'sessionData', 'logs', 'temp'];
keys.forEach((key) => console.log(`${key}:`, app.getPath(key)));
console.log('start whenReady');

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
  var __electron__: typeof electron;
}

let mainWindow: BrowserWindow | undefined;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

/*
 * A second launch fails to acquire the single-instance lock. `app.quit()` only
 * *begins* the asynchronous quit lifecycle - it is not a synchronous halt - so
 * we must guard every piece of startup behind the lock. Otherwise `whenReady()`
 * can resolve before the quit completes and a full second window, protocol
 * handler and native services get spun up. The first instance receives the
 * `second-instance` event and focuses its existing window instead.
 */
if (!gotSingleInstanceLock) {
  console.log('Another instance is already running; quitting this one.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.focus();
    }
  });

  startApp();
}

function startApp() {
  setupDeepLinks(() => mainWindow);
  setupCrashReporting();

  // Snapshot of cookies already persisted, so we only write changed ones to disk.
  const persistedCookies = createCookieSnapshot();

  (async () => {
    await app.whenReady();
    console.log('App is ready');
    setupDesktopAuthIpc();

    // Load any existing cookies from ElectronStore, set as cookie
    await initCookies();

    const serverBuild = await loadServerBuild();

    protocol.handle('http', async (req) => {
      console.log('Handling request for:', req.url);

      if (isDev) {
        console.log('Dev mode: forwarding to vite server');
        return await fetch(req);
      }

      req.headers.append('Referer', req.referrer);

      try {
        const url = new URL(req.url);

        // Forward requests to specific local server ports
        if (url.port !== `${DEFAULT_PORT}`) {
          console.log('Forwarding request to local server:', req.url);
          return await fetch(req);
        }

        // Always try to serve asset first
        const assetPath = path.join(app.getAppPath(), 'build', 'client');
        const res = await serveAsset(req, assetPath);

        if (res) {
          console.log('Served asset:', req.url);
          return res;
        }

        /*
         * Forward only the app origin's own cookies to the remix server. The
         * BrowserWindow shares the default (unpartitioned) session with in-app
         * previews and AI-generated user apps running on other localhost ports,
         * so an empty filter (`{}`) would return every cookie in that session and
         * leak foreign-origin cookies into requests to our own auth-bearing server
         * (and onto disk). `appOriginCookieFilter` scopes the lookup to this
         * request's origin — safe here because we've already confirmed the request
         * targets the app's own server port above.
         */
        const cookies = await session.defaultSession.cookies.get(appOriginCookieFilter(req.url));

        if (cookies.length > 0) {
          req.headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '));

          /*
           * Persist only cookies whose value changed since the last write. electron-store's
           * set() rewrites the whole encrypted config file per call, so storing every cookie
           * on every request caused N*M full-file disk writes per page load. Steady-state
           * navigation now does zero disk I/O.
           */
          const changedCookies = diffCookies(cookies, persistedCookies);

          if (changedCookies.length > 0) {
            await storeCookies(changedCookies);
            recordCookies(changedCookies, persistedCookies);
          }
        }

        // Create request handler with the server build
        const handler = createRequestHandler(serverBuild, 'production');
        console.log('Handling request with server build:', req.url);

        const result = await handler(req, {
          /*
           * Remix app access cloudflare.env
           * Need to pass an empty object to prevent undefined
           */
          // @ts-ignore:next-line
          cloudflare: {},
        });

        return result;
      } catch (err) {
        console.log('Error handling request:', {
          url: req.url,
          error:
            err instanceof Error
              ? {
                  message: err.message,
                  stack: err.stack,
                  cause: err.cause,
                }
              : err,
        });

        const error = err instanceof Error ? err : new Error(String(err));

        return new Response(`Error handling request to ${req.url}: ${error.stack ?? error.message}`, {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        });
      }
    });

    const rendererURL = await (isDev
      ? (async () => {
          await initViteServer();

          if (!viteServer) {
            throw new Error('Vite server is not initialized');
          }

          const listen = await viteServer.listen();
          global.__electron__ = electron;
          viteServer.printUrls();

          return `http://localhost:${listen.config.server.port}`;
        })()
      : `http://localhost:${DEFAULT_PORT}`);

    console.log('Using renderer URL:', rendererURL);

    const win = await createWindow(rendererURL);
    mainWindow = win;
    setupNativeDesktopServices(() => mainWindow);

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = await createWindow(rendererURL);
      }
    });

    console.log('end whenReady');

    return win;
  })()
    /*
     * Removed leftover IPC sample scaffolding: an uncleared setInterval that sent a
     * 'ping' to win.webContents every 60s forever — firing into a possibly-destroyed
     * webContents after window close (errors / wasted work) — plus a no-op ipcTest
     * handler. Neither served any product purpose.
     */
    .then((win) => setupMenu(win));

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  reloadOnChange();
  setupAutoUpdater();
}
