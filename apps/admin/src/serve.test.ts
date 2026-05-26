import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Import the ESM serve module via a relative URL. The .mjs is intentional —
// node-style URL imports of relative paths work under vitest because Vite
// resolves them through the same loader as the runtime.
import { startAdminServer } from '../serve.mjs';

const SCRATCH_DIR = resolve(__dirname, '../.serve-test-dist');
let server: { close: (cb?: () => void) => void; address: () => { port: number } | string | null } | null = null;
let baseUrl = '';

beforeAll(async () => {
  if (existsSync(SCRATCH_DIR)) {
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
  }
  mkdirSync(join(SCRATCH_DIR, 'assets'), { recursive: true });
  writeFileSync(join(SCRATCH_DIR, 'index.html'), '<!doctype html><html><body>Admin SPA</body></html>');
  writeFileSync(join(SCRATCH_DIR, 'assets', 'app.css'), 'body { color: red; }');

  // Port 0 → the OS picks a free port, so concurrent test runs never collide.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server = (await startAdminServer({ distDir: SCRATCH_DIR, port: 0, host: '127.0.0.1' })) as any;
  const addr = server!.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => server?.close(() => resolveClose()));
  if (existsSync(SCRATCH_DIR)) {
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
  }
});

describe('admin static server', () => {
  it('returns 200 + JSON on /health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('serves the SPA shell on /', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toMatch(/no-cache/);
    await expect(response.text()).resolves.toContain('Admin SPA');
  });

  it('serves hashed assets with long-lived immutable cache', async () => {
    const response = await fetch(`${baseUrl}/assets/app.css`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('falls back to index.html for unknown client-side routes', async () => {
    const response = await fetch(`${baseUrl}/users/123/edit`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    await expect(response.text()).resolves.toContain('Admin SPA');
  });

  it('rejects URL-encoded path traversal attempts with 403', async () => {
    const response = await fetch(`${baseUrl}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect(response.status).toBe(403);
  });

  it('rejects non-GET/HEAD methods with 405', async () => {
    const response = await fetch(`${baseUrl}/`, { method: 'POST' });
    expect(response.status).toBe(405);
  });

  it('responds to HEAD requests', async () => {
    const response = await fetch(`${baseUrl}/`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
