import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReadableStreamFromReadable } from '@react-router/node';
import type { ServerBuild } from 'react-router';
import { app } from 'electron';
import mime from 'mime';
import { isDev } from './constants';

export async function loadServerBuild(): Promise<any> {
  if (isDev) {
    console.log('Dev mode: server build not loaded');
    return;
  }

  const serverBuildPath = path.join(app.getAppPath(), 'build', 'server', 'index.js');
  console.log(`Loading server build... path is ${serverBuildPath}`);

  try {
    const fileUrl = pathToFileURL(serverBuildPath).href;
    const serverBuild: ServerBuild = /** @type {ServerBuild} */ await import(fileUrl);
    console.log('Server build loaded successfully');

    // eslint-disable-next-line consistent-return
    return serverBuild;
  } catch (buildError) {
    console.log('Failed to load server build:', {
      message: (buildError as Error)?.message,
      stack: (buildError as Error)?.stack,
      error: JSON.stringify(buildError, Object.getOwnPropertyNames(buildError as object)),
    });

    return;
  }
}

// serve assets built by vite.
export async function serveAsset(req: Request, assetsPath: string): Promise<Response | undefined> {
  const url = new URL(req.url);
  const fullPath = path.normalize(path.join(assetsPath, decodeURIComponent(url.pathname)));
  console.log('Serving asset, path:', fullPath);

  /*
   * Require a true child path. A bare startsWith(assetsPath) with no trailing
   * separator let a percent-encoded `..` climb into a SIBLING dir whose name
   * merely starts with the basename (e.g. build/client -> build/client-secrets).
   * Anchor on assetsPath + path.sep (and allow the dir itself) so only real
   * descendants of the assets dir are served.
   */
  if (fullPath !== assetsPath && !fullPath.startsWith(assetsPath + path.sep)) {
    console.log('Path is outside assets directory:', fullPath);
    return;
  }

  const stat = await fs.stat(fullPath).catch((err) => {
    console.log('Failed to stat file:', fullPath, err);
    return undefined;
  });

  if (!stat?.isFile()) {
    console.log('Not a file:', fullPath);
    return;
  }

  const headers = new Headers();
  const mimeType = mime.getType(fullPath);

  if (mimeType) {
    headers.set('Content-Type', mimeType);
  }

  console.log('Serving file with mime type:', mimeType);

  const body = createReadableStreamFromReadable(createReadStream(fullPath));

  // eslint-disable-next-line consistent-return
  return new Response(body, { headers });
}
