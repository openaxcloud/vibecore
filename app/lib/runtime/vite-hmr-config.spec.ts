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

  it('leaves a config without an ESM default export untouched (CJS safety)', () => {
    const cjs = "const react = require('@vitejs/plugin-react');\nmodule.exports = { plugins: [react()] };\n";
    expect(ensureViteHmrConfig(cjs)).toBe(cjs);
  });

  it('returns empty/whitespace input unchanged', () => {
    expect(ensureViteHmrConfig('')).toBe('');
  });
});
