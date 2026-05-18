#!/usr/bin/env node
// Tiny static-file server for the built admin SPA.
// Serves apps/admin/dist/ with SPA fallback (any non-asset path → index.html).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function createAdminHandler({ distDir }) {
  const DIST = resolve(distDir);
  const INDEX = join(DIST, 'index.html');

  function withinDist(absPath) {
    const normalized = resolve(absPath);
    return normalized === DIST || normalized.startsWith(DIST + sep);
  }

  async function send(res, filePath, statusCode = 200) {
    const body = await readFile(filePath);
    const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const cacheControl =
      filePath === INDEX
        ? 'no-cache, must-revalidate'
        : extname(filePath) === '.html'
          ? 'no-cache'
          : 'public, max-age=31536000, immutable';
    res.writeHead(statusCode, {
      'content-type': mime,
      'content-length': body.length,
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  }

  return async function handler(req, res) {
    try {
      if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
      }
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"status":"ok"}');
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const requested = decodedPath ? join(DIST, decodedPath) : INDEX;
      if (!withinDist(requested)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      try {
        const info = await stat(requested);
        if (info.isFile()) {
          await send(res, requested);
          return;
        }
      } catch {
        // fall through to SPA fallback
      }
      // SPA fallback: serve index.html so client-side router takes over.
      await send(res, INDEX);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(`Internal Server Error: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
    }
  };
}

export function startAdminServer({ distDir, port, host }) {
  const handler = createAdminHandler({ distDir });
  const server = createServer(handler);
  return new Promise((resolvePromise) => {
    server.listen(port, host, () => resolvePromise(server));
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const distDir = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
  startAdminServer({ distDir, port, host }).then(() => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'admin.serve.ready', port, host, dist: distDir }));
  });
}
