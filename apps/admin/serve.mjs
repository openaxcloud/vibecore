import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, 'dist');
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const mimeTypes = {
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
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(path) {
  return mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

async function sendFile(res, path, statusCode = 200) {
  const data = await readFile(path);
  res.writeHead(statusCode, {
    'content-type': contentType(path),
    'cache-control': path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(data);
}

async function tryServe(res, path) {
  try {
    const info = await stat(path);
    if (info.isFile()) {
      await sendFile(res, path);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/health' || pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":"ok"}');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end('method not allowed');
      return;
    }

    pathname = pathname.replace(/\/+$/, '') || '/';
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const requested = normalize(join(root, relative));

    if (!requested.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }

    if (await tryServe(res, requested)) return;

    const indexPath = join(root, 'index.html');
    if (await tryServe(res, indexPath)) return;

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (error) {
    console.error('admin server error', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`admin static server listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`admin server received ${signal}, closing`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
