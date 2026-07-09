/**
 * Guarantee that an AI-GENERATED `vite.config.*` routes HMR through the E-Code
 * preview proxy, exactly like the scaffolded config does.
 *
 * Behind the proxy the dev server is reached over TLS, so Vite's HMR websocket
 * must target the public host on 443/wss. When the model writes its own
 * vite.config (bypassing the scaffold, which only lands when no config exists),
 * that config has no `server.hmr`, Vite's client infers `wss://localhost:undefined`,
 * the websocket construction throws, the module graph never boots, and the app
 * renders blank.
 *
 * Rather than parse the model's arbitrary config object, we WRAP whatever it
 * exports with Vite's own `mergeConfig`, layering an env-gated HMR override on
 * top. This works for both object configs (`export default defineConfig({…})`)
 * and function configs (`export default defineConfig(({mode}) => ({…}))`), never
 * discards the model's settings, and is a no-op locally (env unset).
 *
 * The injected code reads `process.env` at config-eval time (in Node, when Vite
 * loads the config) — the same VITE_HMR_* vars the workspace pod injects.
 */

const MARKER = '__ecodeHmrOverride';

/*
 * Presence of the port pin in an already-wrapped config. Configs wrapped before the
 * pin shipped carry MARKER but not this — they get upgraded in place (see below).
 */
const PIN_MARKER = 'port: 5173';

/*
 * E-Code: force Vite HMR through the preview proxy (TLS/wss) so the client does
 * not build "wss://localhost:undefined" and break the app mount, and PIN the dev
 * server to port 5173 — the port the workspace's port-detection/preview proxy
 * targets for a Vite app. A model-authored config often sets its own server.port
 * (e.g. 3000); left alone Vite binds there while the proxy polls 5173 → endless
 * "preview.proxy.unreachable" and a preview that never loads. mergeConfig layers
 * this OVER the user config so the pinned port wins. Env-gated: when
 * VITE_HMR_CLIENT_PORT is unset (local dev) only host:true is applied, keeping the
 * user's own port + default HMR. Mirrors preview-manifest's scaffold config.
 */
const OVERRIDE_BLOCK = `const ${MARKER} = {
  server: {
    host: true,
    ...(process.env.VITE_HMR_CLIENT_PORT
      ? {
          port: 5173,
          strictPort: true,
          hmr: {
            clientPort: Number(process.env.VITE_HMR_CLIENT_PORT),
            protocol: process.env.VITE_HMR_PROTOCOL || 'wss',
            ...(process.env.VITE_HMR_HOST ? { host: process.env.VITE_HMR_HOST } : {}),
          },
        }
      : {}),
  },
};
`;

const INJECTED_HEADER = `import { mergeConfig as __ecodeMergeConfig } from 'vite';

${OVERRIDE_BLOCK}`;

const INJECTED_FOOTER = `
export default typeof __ecodeUserConfig === 'function'
  ? (env) => __ecodeMergeConfig(__ecodeUserConfig(env), ${MARKER})
  : __ecodeMergeConfig(__ecodeUserConfig, ${MARKER});
`;

/*
 * CommonJS twin of INJECTED_HEADER/FOOTER. A model sometimes writes its vite
 * config as `module.exports = defineConfig(...)` (CJS) — the ESM `export default`
 * transform below can't touch that, so before this fix `ensureViteHmrConfig`
 * silently no-op'd and the model's own port survived. `require('vite')` +
 * `module.exports =` wrap it equivalently, preserving the model's plugins/require
 * calls while layering the same env-gated 5173 pin on top.
 */
const INJECTED_CJS_HEADER = `const { mergeConfig: __ecodeMergeConfig } = require('vite');

${OVERRIDE_BLOCK}`;

const INJECTED_CJS_FOOTER = `
module.exports = typeof __ecodeUserConfig === 'function'
  ? (env) => __ecodeMergeConfig(__ecodeUserConfig(env), ${MARKER})
  : __ecodeMergeConfig(__ecodeUserConfig, ${MARKER});
`;

/*
 * Last-resort deterministic preview config, emitted ONLY when the source exports
 * through neither `export default` nor `module.exports =` (a shape we can't safely
 * merge onto). Rather than no-op and let the model's port stand, replace the config
 * with a minimal one that still carries the env-gated 5173 pin — a pin ALWAYS
 * exists so the preview proxy's target port is guaranteed. Contains MARKER +
 * PIN_MARKER so a re-run is idempotent.
 */
const FALLBACK_CONFIG = `import { defineConfig } from 'vite';

/* E-Code: original vite.config had no recognizable default/module.exports export;
 * emitting a minimal preview config so the dev server is pinned to 5173 (the port
 * the preview proxy targets) rather than leaving the model's port unpinned. */
${OVERRIDE_BLOCK}
export default defineConfig(${MARKER});
`;

/**
 * Return the config source with the HMR override + 5173 pin GUARANTEED. Idempotent.
 * Handles three shapes so the pin is never silently skipped:
 *   1. ESM `export default <expr>`      → mergeConfig wrap (import + export default).
 *   2. CJS `module.exports = <expr>`     → mergeConfig wrap (require + module.exports).
 *   3. anything else (unusual/unparseable) → replace with a minimal pinned config.
 * Before this fix (2) and (3) hit a no-op branch, so a model's own server.port
 * (e.g. 3000) survived while the preview proxy polled 5173 forever.
 */
export function ensureViteHmrConfig(source: string): string {
  if (!source) {
    return source;
  }

  if (source.includes(MARKER)) {
    /*
     * Already wrapped. If it predates the port pin (an older injected header that
     * only set host:true + hmr, MARKER present but no `port: 5173`), UPGRADE it in
     * place: such a config still lets the model's own server.port win (e.g. 3000)
     * while the preview proxy targets 5173, so the app stays blank. The plain
     * MARKER-only idempotency check skipped these forever. Insert the pin into the
     * existing env-gated override block so it aligns without a full, fragile
     * re-wrap. When the pin is already there it's current → no-op (idempotent).
     */
    if (source.includes(PIN_MARKER)) {
      return source;
    }

    return source.replace(
      /(process\.env\.VITE_HMR_CLIENT_PORT\s*\?\s*\{)/,
      '$1\n          port: 5173,\n          strictPort: true,',
    );
  }

  /*
   * Replace ONLY the first `export default ` — a config file has exactly one —
   * turning `export default <expr>` into `const __ecodeUserConfig = <expr>` so
   * the appended footer can merge it.
   */
  const exportDefault = /(^|\n)\s*export\s+default\s+/;

  if (exportDefault.test(source)) {
    const rewritten = source.replace(exportDefault, (_match, prefix) => `${prefix}const __ecodeUserConfig = `);

    return `${INJECTED_HEADER}\n${rewritten.trimEnd()}\n${INJECTED_FOOTER}`;
  }

  /*
   * CommonJS: `module.exports = <expr>`. Same idea, but the wrapper uses
   * require()/module.exports so it stays valid CJS (mixing ESM `import` into a CJS
   * file would break the config load). Replace only the first `module.exports =`
   * assignment; a `module.exports.foo =` property write is intentionally NOT
   * matched (the `=` immediately after `module.exports`).
   */
  const moduleExports = /(^|\n)\s*module\.exports\s*=\s*/;

  if (moduleExports.test(source)) {
    const rewritten = source.replace(moduleExports, (_match, prefix) => `${prefix}const __ecodeUserConfig = `);

    return `${INJECTED_CJS_HEADER}\n${rewritten.trimEnd()}\n${INJECTED_CJS_FOOTER}`;
  }

  /*
   * Unusual/unparseable shape (no default export, no module.exports assignment).
   * We can't merge onto it, but silently returning it lets the model's port stand
   * and the preview loops on unreachable 5173. Emit a deterministic minimal config
   * that carries the pin so 5173 is ALWAYS guaranteed.
   */
  return FALLBACK_CONFIG;
}
