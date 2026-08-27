/**
 * BUG-GEN-BACKEND-UNSERVED-001 — a generated frontend calls fetch('/api/...')
 * but nothing serves /api/* in the Vite dev server: plain `vite` answers with
 * the SPA index.html fallback, res.json() throws, and the app shows a dead
 * error while the agent reports success.
 *
 * Unit half: detection + config-wrap are pure and tested on file maps.
 * Real-server half: boots an ACTUAL Vite dev server on a fixture project and
 * measures both sides — without the middleware /api/counter returns HTML
 * (the live failure), with it the project's own handler modules answer JSON.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { buildPreviewManifestRepair } from './preview-manifest';
import {
  API_SERVE_MARKER,
  detectClientApiCalls,
  ensureViteApiServeConfig,
  hasApiServingMechanism,
  needsApiDevServe,
} from './vite-api-serve';

describe('detectClientApiCalls', () => {
  it('finds fetch and axios calls to same-origin /api endpoints', () => {
    const files = {
      'src/components/Counter.tsx': `
        const load = () => fetch('/api/counter').then((r) => r.json());
        const inc = () => fetch('/api/counter/increment', { method: 'POST' });
        const reset = () => axios.post('/api/counter/reset');
      `,
    };

    const calls = detectClientApiCalls(files);

    expect(calls.map((call) => call.url)).toEqual(['/api/counter', '/api/counter/increment', '/api/counter/reset']);
    expect(calls.every((call) => call.importer === 'src/components/Counter.tsx')).toBe(true);
  });

  it('ignores absolute URLs and non-source files', () => {
    const files = {
      'src/App.tsx': `fetch('https://example.com/api/data');`,
      'README.md': `fetch('/api/counter')`,
    };

    expect(detectClientApiCalls(files)).toEqual([]);
  });
});

describe('hasApiServingMechanism', () => {
  const client = { 'src/App.tsx': `fetch('/api/counter')` };

  it('is false for a plain Vite SPA with nothing serving /api', () => {
    expect(
      hasApiServingMechanism({
        ...client,
        'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
      }),
    ).toBe(false);
    expect(needsApiDevServe({ ...client, 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }) })).toBe(true);
  });

  it('is true when a vite config registers a dev middleware', () => {
    expect(
      hasApiServingMechanism({
        ...client,
        'vite.config.ts': `export default { plugins: [{ name: 'x', configureServer(server) {} }] };`,
      }),
    ).toBe(true);
  });

  it('is true when the vite config proxies /api', () => {
    expect(
      hasApiServingMechanism({
        ...client,
        'vite.config.ts': `export default { server: { proxy: { '/api': 'http://localhost:3001' } } };`,
      }),
    ).toBe(true);
  });

  it('is true for framework API routes and custom dev scripts', () => {
    expect(hasApiServingMechanism({ ...client, 'pages/api/counter.ts': 'export default () => {};' })).toBe(true);
    expect(hasApiServingMechanism({ ...client, 'src/app/api/counter/route.ts': 'export function GET() {}' })).toBe(
      true,
    );
    expect(
      hasApiServingMechanism({
        ...client,
        'package.json': JSON.stringify({ scripts: { dev: 'concurrently "vite" "node server.js"' } }),
      }),
    ).toBe(true);
  });
});

describe('ensureViteApiServeConfig', () => {
  it('wraps an ESM default export with the mergeConfig plugin overlay', () => {
    const wrapped = ensureViteApiServeConfig(
      `import { defineConfig } from 'vite';\nexport default defineConfig({});\n`,
    );

    expect(wrapped).toContain(API_SERVE_MARKER);
    expect(wrapped).toContain('ecode-api-dev-serve');
    expect(wrapped).toContain('const __ecodeApiUserConfig = defineConfig({});');
    expect(wrapped).toContain('export default typeof __ecodeApiUserConfig');
  });

  it('wraps a CJS module.exports config', () => {
    const wrapped = ensureViteApiServeConfig(`module.exports = { plugins: [] };\n`);

    expect(wrapped).toContain(API_SERVE_MARKER);
    expect(wrapped).toContain('module.exports = typeof __ecodeApiUserConfig');
    expect(wrapped).not.toContain('import {');
  });

  it('is idempotent and leaves unrecognizable shapes unchanged', () => {
    const wrapped = ensureViteApiServeConfig(`export default {};\n`);

    expect(ensureViteApiServeConfig(wrapped)).toBe(wrapped);

    const weird = `exports.config = {};\n`;
    expect(ensureViteApiServeConfig(weird)).toBe(weird);
  });
});

describe('buildPreviewManifestRepair API wiring', () => {
  const counterApp = {
    'package.json': JSON.stringify({ name: 'counter', scripts: { dev: 'vite' }, dependencies: {} }),
    'index.html': '<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': `import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);`,
    'src/App.tsx': `export default function App() { fetch('/api/counter'); return <div />; }`,
    'src/api/counter.ts': `export function GET() { return { count: 0 }; }`,
  };

  it('emits a vite config carrying the dev API middleware when /api is fetched but unserved', () => {
    const repair = buildPreviewManifestRepair(counterApp);
    const viteConfig = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));

    expect(viteConfig).toBeDefined();
    expect(viteConfig!.content).toContain(API_SERVE_MARKER);
    expect(viteConfig!.content).toContain('ecode-api-dev-serve');
  });

  it('injects the middleware into a model-written vite config too', () => {
    const repair = buildPreviewManifestRepair({
      ...counterApp,
      'vite.config.ts': `import { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [] });\n`,
    });

    const viteConfig = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));

    expect(viteConfig).toBeDefined();
    expect(viteConfig!.content).toContain(API_SERVE_MARKER);
  });

  it('does not wire anything when no client code fetches /api', () => {
    const repair = buildPreviewManifestRepair({
      ...counterApp,
      'src/App.tsx': `export default function App() { return <div>local only</div>; }`,
    });

    const viteConfig = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));

    expect(viteConfig).toBeDefined();
    expect(viteConfig!.content).not.toContain(API_SERVE_MARKER);
  });

  it('respects a model config that already serves /api itself', () => {
    const repair = buildPreviewManifestRepair({
      ...counterApp,
      'vite.config.ts': `export default { plugins: [{ name: 'own-api', configureServer(server) {} }] };\n`,
    });

    const viteConfig = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));

    // May be re-emitted for the HMR pin, but must NOT carry our API overlay.
    if (viteConfig) {
      expect(viteConfig.content).not.toContain(API_SERVE_MARKER);
    }
  });
});

/*
 * Real measurement on an actual Vite dev server (the non-regression the fix is
 * judged on): WITHOUT the middleware, GET /api/counter falls through to the SPA
 * index.html fallback — the exact live failure. WITH it, the fixture's own
 * src/api handler modules answer JSON, including POST body parsing and the
 * descriptive 404 for a missing module.
 *
 * The fixture lives under node_modules/ (git-ignored, resolvable to the repo's
 * vite install) and is removed afterwards.
 */
describe('dev server actually serves generated /api routes', () => {
  const fixtures: string[] = [];
  const servers: ViteDevServer[] = [];

  afterAll(async () => {
    for (const server of servers) {
      await server.close().catch(() => undefined);
    }

    for (const dir of fixtures) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeFixture(withMiddleware: boolean): string {
    const dir = mkdtempSync(path.join(process.cwd(), 'node_modules', '.ecode-api-serve-fixture-'));

    fixtures.push(dir);
    mkdirSync(path.join(dir, 'src/api/counter'), { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), '<html><body><div id="root"></div></body></html>');
    writeFileSync(path.join(dir, 'src/api/counter.ts'), `export function GET() {\n  return { count: 7 };\n}\n`);
    writeFileSync(
      path.join(dir, 'src/api/counter/increment.ts'),
      `export function POST(req: { body?: { by?: number } }) {\n  return { count: 7 + (req.body?.by ?? 1) };\n}\n`,
    );
    writeFileSync(
      path.join(dir, 'src/api/counter/reset.ts'),
      `export default function handler(_req: unknown, res: any) {\n  res.statusCode = 200;\n  res.setHeader('content-type', 'application/json');\n  res.end(JSON.stringify({ count: 0 }));\n}\n`,
    );

    const baseConfig = `export default {};\n`;

    writeFileSync(path.join(dir, 'vite.config.ts'), withMiddleware ? ensureViteApiServeConfig(baseConfig) : baseConfig);

    return dir;
  }

  async function startServer(root: string): Promise<{ server: ViteDevServer; origin: string }> {
    const server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
    });

    servers.push(server);
    await server.listen();

    const address = server.httpServer?.address();

    if (!address || typeof address === 'string') {
      throw new Error('vite dev server did not expose a bound port');
    }

    return { server, origin: `http://127.0.0.1:${address.port}` };
  }

  it('WITHOUT the middleware, /api/counter falls through to SPA HTML (the live bug)', async () => {
    const { origin } = await startServer(writeFixture(false));
    const response = await fetch(`${origin}/api/counter`);

    expect(response.headers.get('content-type') ?? '').toContain('text/html');
    await expect(response.clone().json()).rejects.toThrow();
  });

  it('WITH the middleware, the generated handler modules answer for real', async () => {
    const { origin } = await startServer(writeFixture(true));

    const get = await fetch(`${origin}/api/counter`);
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type') ?? '').toContain('application/json');
    expect(await get.json()).toEqual({ count: 7 });

    const post = await fetch(`${origin}/api/counter/increment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ by: 2 }),
    });
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ count: 9 });

    const reset = await fetch(`${origin}/api/counter/reset`, { method: 'POST' });
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ count: 0 });

    const missing = await fetch(`${origin}/api/nothing-here`);
    expect(missing.status).toBe(404);

    const missingBody = (await missing.json()) as { error: string };
    expect(missingBody.error).toContain('no handler module found');
  });
});
