import { app, BrowserWindow } from 'electron';
import log from 'electron-log';

const protocol = 'vibecore';
let pendingDeepLink: string | undefined;

function routeDeepLink(url: string, win?: BrowserWindow | null) {
  pendingDeepLink = url;

  if (!win || win.isDestroyed()) {
    return;
  }

  win.webContents.send('desktop:deep-link', url);

  try {
    const parsed = new URL(url);
    const [, resource, id] = parsed.pathname.split('/');
    const target = parsed.hostname || resource;
    const targetId = parsed.hostname ? resource : id;

    if (target === 'project' && targetId) {
      win.loadURL(`http://localhost:5173/projects/${encodeURIComponent(targetId)}/ide`);
    } else if (target === 'workspace' && targetId) {
      win.loadURL(`http://localhost:5173/projects/${encodeURIComponent(targetId)}/ide`);
    }
  } catch (error) {
    log.warn('Invalid deep link', { url, error });
  }
}

export function getPendingDeepLink() {
  return pendingDeepLink;
}

export function setupDeepLinks(getWindow: () => BrowserWindow | undefined) {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [process.argv[1]]);
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    routeDeepLink(url, getWindow());
  });

  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${protocol}://`));

    if (url) {
      routeDeepLink(url, getWindow());
    }
  });
}
