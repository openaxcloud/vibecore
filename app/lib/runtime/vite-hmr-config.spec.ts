import { describe, expect, it } from 'vitest';
import { ensureViteHmrConfig } from './vite-hmr-config';

const OBJECT_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

const FUNCTION_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __MODE__: JSON.stringify(mode) },
}));
`;

describe('ensureViteHmrConfig', () => {
  it('wraps an object config with mergeConfig + the HMR override, preserving the original', () => {
    const out = ensureViteHmrConfig(OBJECT_CONFIG);

    expect(out).toContain("import { mergeConfig as __ecodeMergeConfig } from 'vite'");
    expect(out).toContain('const __ecodeUserConfig = defineConfig({');
    expect(out).toContain('__ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride)');

    // The model's original settings are still present.
    expect(out).toContain('plugins: [react()]');

    // The HMR override is env-gated on VITE_HMR_CLIENT_PORT.
    expect(out).toContain('VITE_HMR_CLIENT_PORT');
    expect(out).toContain('host: true');

    /*
     * In the preview env it PINS the dev server to 5173 (the port the workspace
     * preview proxy targets) so a model config's own server.port (e.g. 3000) can't
     * leave Vite listening where the proxy never looks → mergeConfig makes it win.
     */
    expect(out).toContain('port: 5173');
    expect(out).toContain('strictPort: true');

    // Exactly one default export in the output.
    expect(out.match(/export\s+default/g)?.length).toBe(1);
  });

  it('handles a function config by merging on the resolved object', () => {
    const out = ensureViteHmrConfig(FUNCTION_CONFIG);

    expect(out).toContain('const __ecodeUserConfig = defineConfig(({ mode }) =>');
    expect(out).toContain('(env) => __ecodeMergeConfig(__ecodeUserConfig(env), __ecodeHmrOverride)');
    expect(out).toContain('define: { __MODE__: JSON.stringify(mode) }');
  });

  it('is idempotent — a second pass does not double-wrap', () => {
    const once = ensureViteHmrConfig(OBJECT_CONFIG);
    const twice = ensureViteHmrConfig(once);

    expect(twice).toBe(once);
    expect(twice.match(/__ecodeHmrOverride =/g)?.length).toBe(1);
  });

  it('upgrades an OLD wrap (MARKER present, no port pin) in place without re-wrapping', () => {
    /*
     * A config wrapped before the port pin shipped: it has the marker + host:true +
     * hmr, but no `port: 5173`, so the model's own server.port (3000) still wins.
     */
    const OLD_WRAP = [
      "import { mergeConfig as __ecodeMergeConfig } from 'vite';",
      'const __ecodeHmrOverride = {',
      '  server: {',
      '    host: true,',
      '    ...(process.env.VITE_HMR_CLIENT_PORT',
      '      ? {',
      '          hmr: { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) },',
      '        }',
      '      : {}),',
      '  },',
      '};',
      "import { defineConfig } from 'vite';",
      'const __ecodeUserConfig = defineConfig({ server: { port: 3000 } });',
      'export default __ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride);',
      '',
    ].join('\n');

    const out = ensureViteHmrConfig(OLD_WRAP);

    // The pin is inserted into the existing override block…
    expect(out).toContain('port: 5173');
    expect(out).toContain('strictPort: true');

    // …the model's original settings are preserved…
    expect(out).toContain('server: { port: 3000 }');

    // …and it is NOT double-wrapped (still exactly one override + one default export).
    expect(out.match(/__ecodeHmrOverride =/g)?.length).toBe(1);
    expect(out.match(/export\s+default/g)?.length).toBe(1);

    // Second pass is now a no-op (pin present → idempotent).
    expect(ensureViteHmrConfig(out)).toBe(out);
  });

  it('leaves a config without an ESM default export untouched (CJS safety)', () => {
    const cjs = "const react = require('@vitejs/plugin-react');\nmodule.exports = { plugins: [react()] };\n";
    expect(ensureViteHmrConfig(cjs)).toBe(cjs);
  });

  it('returns empty/whitespace input unchanged', () => {
    expect(ensureViteHmrConfig('')).toBe('');
  });
});
