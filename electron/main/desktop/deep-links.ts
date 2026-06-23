import { app, BrowserWindow } from 'electron';
import log from 'electron-log';

const protocol = 'vibecore';

/**
 * Fallback renderer origin used when no live origin is provided. Matches the
 * production `DEFAULT_PORT`; in dev the actual origin is injected via
 * `setupDeepLinks` because Vite may auto-increment the port when 5173 is taken.
 */
const DEFAULT_RENDERER_ORIGIN = 'http://localhost:5173';

let pendingDeepLink: string | undefined;

/** Normalize a renderer URL/origin down to a bare `scheme://host[:port]` origin. */
function toOrigin(rendererUrl: string): string {
  try {
    return new URL(rendererUrl).origin;
  } catch {
    return DEFAULT_RENDERER_ORIGIN;
  }
}

/**
 * Parse a `vibecore://` deep link into the renderer route it should navigate to.
 * Supports both `vibecore://project/<id>` (host-based) and `vibecore:///project/<id>`
 * (path-based) shapes. Returns `undefined` when the URL is invalid or unrecognized.
 *
 * The route is built from `origin` (the live renderer origin) rather than a
 * hardcoded port so that, in dev, deep links navigate to the window's actual
 * server even when Vite picked a port other than 5173.
 *
 * Pure (no Electron dependency) so it can be unit-tested in isolation.
 */
export function parseDeepLinkTarget(url: string, origin: string = DEFAULT_RENDERER_ORIGIN): string | undefined {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const [, resource, id] = parsed.pathname.split('/');
  const target = parsed.hostname || resource;
  const targetId = parsed.hostname ? resource : id;

  if ((target === 'project' || target === 'workspace') && targetId) {
    return `${toOrigin(origin)}/projects/${encodeURIComponent(targetId)}/ide`;
  }

  return undefined;
}

function routeDeepLink(url: string, win: BrowserWindow | null | undefined, origin: string) {
  pendingDeepLink = url;

  if (!win || win.isDestroyed()) {
    return;
  }

  /*
   * The deep link has been delivered to a live window; clear the cold-start backlog
   * so it isn't replayed again on the next window/load.
   */
  pendingDeepLink = undefined;

  win.webContents.send('desktop:deep-link', url);

  const targetUrl = parseDeepLinkTarget(url, origin);

  if (targetUrl) {
    win.loadURL(targetUrl).catch((error) => {
      log.warn('Failed to navigate to deep link target', { url, error });
    });
  } else {
    try {
      // Re-parse only to surface a warning for genuinely malformed URLs.
      // eslint-disable-next-line no-new
      new URL(url);
    } catch (error) {
      log.warn('Invalid deep link', { url, error });
    }
  }
}

export function getPendingDeepLink() {
  return pendingDeepLink;
}

export function setupDeepLinks(
  getWindow: () => BrowserWindow | undefined,
  getRendererOrigin: () => string = () => DEFAULT_RENDERER_ORIGIN,
) {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    routeDeepLink(url, getWindow(), getRendererOrigin());
  });

  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${protocol}://`));

    if (url) {
      routeDeepLink(url, getWindow(), getRendererOrigin());
    }
  });

  /*
   * Cold-start replay: on macOS an `open vibecore://…` before the window exists fires
   * `open-url` while getWindow() is still undefined, so routeDeepLink only stashes the
   * url in pendingDeepLink and returns. The window is created later in index.ts; hook
   * each new window's first successful load and replay the stashed link to it.
   */
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', () => {
      const pending = getPendingDeepLink();

      if (pending && !win.isDestroyed()) {
        routeDeepLink(pending, win, getRendererOrigin());
      }
    });
  });
}
