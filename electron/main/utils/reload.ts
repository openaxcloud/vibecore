import { app } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isDev } from './constants';

// Reload on change.
let isQuited = false;

const abort = new AbortController();
const { signal } = abort;

export async function reloadOnChange() {
  // Dev-only hot reload. In a packaged build any write under the app dir (auto-update
  // staging, AV/indexer touching files, non-asar layouts) would otherwise relaunch the
  // running app from under the user. Never watch outside of dev mode.
  if (!isDev) {
    return;
  }

  const dir = path.join(app.getAppPath(), 'build', 'electron');

  try {
    const watcher = fs.watch(dir, { signal, recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of watcher) {
      if (!isQuited) {
        isQuited = true;
        app.relaunch();
        app.quit();
      }
    }
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    if (err.name === 'AbortError') {
      console.log('abort watching:', dir);
      return;
    }
  }
}
