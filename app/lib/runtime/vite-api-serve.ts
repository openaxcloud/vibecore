/**
 * Serve generated `/api/*` routes from the SAME Vite dev server the preview runs
 * (BUG-GEN-BACKEND-UNSERVED-001).
 *
 * The generation prompt promises single-command runnability: "if a backend/API is
 * required, serve it from the SAME dev server (e.g. a Vite dev-server
 * middleware/plugin)". In practice the model frequently emits a frontend that
 * calls `fetch('/api/...')` plus handler-ish backend files, but NO
 * `configureServer` wiring — and the platform had no mechanism of its own. A
 * plain `vite` dev server then answers `/api/*` with the SPA `index.html`
 * fallback (HTTP 200, text/html), the client's `res.json()` throws, and the app
 * shows a dead "cannot load" error while the agent reports success.
 *
 * This module is the deterministic other half of that contract:
 *   1. detect client code that calls a same-origin `/api/...` endpoint,
 *   2. detect whether ANYTHING actually serves it (model-written middleware,
 *      an /api dev proxy, framework API routes, or a custom dev script),
 *   3. when nothing does, post-process `vite.config.*` (same mergeConfig-wrap
 *      strategy as {@link ensureViteHmrConfig}) to add a `configureServer`
 *      middleware that mounts `/api/<path>` onto the project's OWN handler
 *      modules (`src/api/**`, `server/api/**`, `api/**`, …) via
 *      `server.ssrLoadModule`.
 *
 * The middleware never invents business logic: it only executes handler modules
 * the model actually generated (method exports `GET`/`POST`/…, `handler`, or a
 * default export with the Node `(req, res)` signature — an Express app instance
 * also satisfies that shape). When no module matches, it answers a descriptive
 * JSON 404 instead of the silent SPA-HTML fallback, so the failure is visible
 * and actionable. Pure string/file-map functions, unit-testable without a
 * server; the injected code itself is exercised by the real-dev-server spec.
 */

export const API_SERVE_MARKER = '__ecodeApiDevServe';

/** A client-side call to a same-origin /api endpoint. */
export interface ClientApiCall {
  importer: string;
  url: string;
}

const SOURCE_FILE_RE = /\.(c|m)?(j|t)sx?$/;

/*
 * fetch('/api/...') / axios.get('/api/...') / axios('/api/...') with any quote
 * style. Interpolated template URLs (`/api/counter/` + id) still match on the
 * literal `/api` prefix.
 */
const CLIENT_API_CALL_RE =
  /(?:\bfetch\s*\(|\baxios\s*(?:\.\s*(?:get|post|put|patch|delete|head|options|request)\s*)?\()\s*[`'"](\/api(?:\/[^`'"]*)?)[`'"]?/g;

/** Every same-origin `/api/...` call site in the project's source files. */
export function detectClientApiCalls(files: Record<string, string>): ClientApiCall[] {
  const calls: ClientApiCall[] = [];

  for (const [importer, content] of Object.entries(files)) {
    if (!SOURCE_FILE_RE.test(importer) || /\.d\.ts$/.test(importer)) {
      continue;
    }

    CLIENT_API_CALL_RE.lastIndex = 0;

    for (let match = CLIENT_API_CALL_RE.exec(content); match; match = CLIENT_API_CALL_RE.exec(content)) {
      calls.push({ importer, url: match[1] });
    }
  }

  return calls;
}

const VITE_CONFIG_RE = /(^|\/)vite\.config\.(t|j|mt|mj|ct|cj)s$/;

/*
 * Framework conventions whose OWN dev server serves API routes (Next pages/app
 * router, SvelteKit +server endpoints, Remix resource routes).
 */
const FRAMEWORK_API_ROUTE_RES = [
  /(^|\/)pages\/api\//,
  /(^|\/)app\/api\/.+\/route\.(t|j)sx?$/,
  /\+server\.(t|j)s$/,
  /(^|\/)routes\/api[./]/,
];

/**
 * True when SOMETHING in the project already serves same-origin `/api/*` in dev:
 *   - any source/config file registering a dev middleware (`configureServer`),
 *   - a vite config proxying `/api`,
 *   - framework API-route files (Next/SvelteKit/Remix conventions),
 *   - a root `dev` script that is not plain `vite` (custom/concurrent server,
 *     `next dev`, …) and therefore owns its own serving story.
 *
 * `files` must be scoped relative to the package root (same contract as the
 * other preview-manifest helpers).
 */
export function hasApiServingMechanism(files: Record<string, string>): boolean {
  for (const [path, content] of Object.entries(files)) {
    if (FRAMEWORK_API_ROUTE_RES.some((re) => re.test(path))) {
      return true;
    }

    if (!SOURCE_FILE_RE.test(path)) {
      continue;
    }

    if (content.includes('configureServer')) {
      return true;
    }

    if (VITE_CONFIG_RE.test(path) && /\bproxy\b/.test(content) && content.includes('/api')) {
      return true;
    }
  }

  const rawPackageJson = files['package.json'];

  if (rawPackageJson) {
    try {
      const parsed = JSON.parse(rawPackageJson) as { scripts?: Record<string, unknown> };
      const dev = typeof parsed?.scripts?.dev === 'string' ? parsed.scripts.dev.trim() : '';

      if (dev && !/^vite(\s|$)/.test(dev)) {
        return true;
      }
    } catch {
      // Unparseable manifest: fall through (the manifest repair rebuilds it with a plain `vite` dev script).
    }
  }

  return false;
}

/**
 * True when the project needs the injected dev API middleware: the client calls
 * `/api/...` and nothing serves it.
 */
export function needsApiDevServe(files: Record<string, string>): boolean {
  return detectClientApiCalls(files).length > 0 && !hasApiServingMechanism(files);
}

/*
 * The injected plugin. Plain dependency-free JS (valid in both an ESM and a CJS
 * vite config), no template interpolation, no regex literals — string ops only,
 * so the generated text survives any further tooling untouched.
 *
 * Resolution for `/api/a/b`: try, in order and across handler bases
 * (src/api, src/server/api, server/api, api, src/backend/api):
 *   <base>/a/b.<ext>, <base>/a/b/index.<ext>, then the parent module
 *   <base>/a.<ext> (a module may handle its own sub-actions), … down to
 *   <base>.<ext> / <base>/index.<ext>. First existing file wins and is loaded
 *   through server.ssrLoadModule (full TS/ESM support, HMR-aware).
 */
const API_SERVE_PLUGIN_BLOCK = `const ${API_SERVE_MARKER} = {
  name: 'ecode-api-dev-serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = String(req.url || '').split('?')[0];

      if (pathname !== '/api' && pathname.indexOf('/api/') !== 0) {
        next();
        return;
      }

      (async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');

        let rest = pathname.slice('/api'.length);
        while (rest.charAt(0) === '/') rest = rest.slice(1);
        while (rest.charAt(rest.length - 1) === '/') rest = rest.slice(0, -1);

        const parts = rest ? rest.split('/') : [];
        const bases = ['src/api', 'src/server/api', 'src/backend/api', 'server/api', 'backend/api', 'api'];
        const exts = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
        const candidates = [];

        for (let depth = parts.length; depth >= 0; depth -= 1) {
          const stem = parts.slice(0, depth).join('/');

          for (const base of bases) {
            const dir = stem ? base + '/' + stem : base;

            for (const ext of exts) {
              candidates.push(dir + ext);
              candidates.push(dir + '/index' + ext);
            }
          }
        }

        const found = candidates.find((candidate) => fs.existsSync(path.join(server.config.root, candidate)));
        const method = String(req.method || 'GET').toUpperCase();

        if (!found) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'E-Code dev API: no handler module found for ' +
                pathname +
                '. Create src/api' +
                (parts.length ? '/' + parts.join('/') : '/index') +
                '.ts exporting ' +
                method +
                ', handler, or a default (req, res) function.',
            }),
          );
          return;
        }

        const mod = await server.ssrLoadModule('/' + found);
        const handler = mod[method] || mod[method.toLowerCase()] || mod.handler || mod.default;

        if (typeof handler !== 'function') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'E-Code dev API: ' +
                found +
                ' has no callable export for ' +
                method +
                ' (available: ' +
                Object.keys(mod).join(', ') +
                ').',
            }),
          );
          return;
        }

        if (req.body === undefined && method !== 'GET' && method !== 'HEAD') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString('utf8');
          req.rawBody = rawBody;
          try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            req.body = rawBody;
          }
        }

        const result = await handler(req, res, next);

        if (res.writableEnded) {
          return;
        }

        // Web-API style handler (Next app-router shape): returned a Response.
        if (result && typeof result === 'object' && typeof result.arrayBuffer === 'function' && typeof result.status === 'number') {
          res.statusCode = result.status;

          if (result.headers && typeof result.headers.forEach === 'function') {
            result.headers.forEach((value, key) => res.setHeader(key, value));
          }

          res.end(Buffer.from(await result.arrayBuffer()));
          return;
        }

        if (result !== undefined) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(result));
          return;
        }

        // (req, res) handlers own the response lifecycle (may still be writing).
        if (handler.length >= 2) {
          return;
        }

        res.statusCode = 204;
        res.end();
      })().catch((error) => {
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'E-Code dev API handler failed: ' + String((error && error.message) || error) }));
        }
      });
    });
  },
};

const __ecodeApiServeOverride = { plugins: [${API_SERVE_MARKER}] };
`;

const INJECTED_ESM_HEADER = `import { mergeConfig as __ecodeApiMergeConfig } from 'vite';

${API_SERVE_PLUGIN_BLOCK}`;

const INJECTED_ESM_FOOTER = `
export default typeof __ecodeApiUserConfig === 'function'
  ? (env) => __ecodeApiMergeConfig(__ecodeApiUserConfig(env), __ecodeApiServeOverride)
  : __ecodeApiMergeConfig(__ecodeApiUserConfig, __ecodeApiServeOverride);
`;

const INJECTED_CJS_HEADER = `const { mergeConfig: __ecodeApiMergeConfig } = require('vite');

${API_SERVE_PLUGIN_BLOCK}`;

const INJECTED_CJS_FOOTER = `
module.exports = typeof __ecodeApiUserConfig === 'function'
  ? (env) => __ecodeApiMergeConfig(__ecodeApiUserConfig(env), __ecodeApiServeOverride)
  : __ecodeApiMergeConfig(__ecodeApiUserConfig, __ecodeApiServeOverride);
`;

/**
 * Return the vite config source with the dev API middleware GUARANTEED, using
 * the same wrap-with-mergeConfig strategy (and the same ESM/CJS shapes) as
 * {@link ensureViteHmrConfig}, so it composes with an already-HMR-wrapped
 * config. Idempotent via {@link API_SERVE_MARKER}. An unrecognizable shape is
 * returned unchanged (never destroy a config for an optional capability —
 * unlike the HMR pin, the preview still renders without this middleware).
 */
export function ensureViteApiServeConfig(source: string): string {
  if (!source || source.includes(API_SERVE_MARKER)) {
    return source;
  }

  const exportDefault = /(^|\n)\s*export\s+default\s+/;

  if (exportDefault.test(source)) {
    const rewritten = source.replace(exportDefault, (_match, prefix) => `${prefix}const __ecodeApiUserConfig = `);

    return `${INJECTED_ESM_HEADER}\n${rewritten.trimEnd()}\n${INJECTED_ESM_FOOTER}`;
  }

  const moduleExports = /(^|\n)\s*module\.exports\s*=\s*/;

  if (moduleExports.test(source)) {
    const rewritten = source.replace(moduleExports, (_match, prefix) => `${prefix}const __ecodeApiUserConfig = `);

    return `${INJECTED_CJS_HEADER}\n${rewritten.trimEnd()}\n${INJECTED_CJS_FOOTER}`;
  }

  return source;
}
