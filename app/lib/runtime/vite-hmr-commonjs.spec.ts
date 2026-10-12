import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPreviewManifestRepair } from './preview-manifest';
import { ensureViteApiServeConfig } from './vite-api-serve';
import { ensureViteHmrConfig } from './vite-hmr-config';

const directories: string[] = [];
const root = process.cwd();

function fixture(source: string, extension = 'cjs') {
  const dir = mkdtempSync(path.join(tmpdir(), 'a37-commonjs-'));
  directories.push(dir);
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');

  const file = path.join(dir, `vite.config.${extension}`);
  writeFileSync(file, source);

  return { dir, file };
}

afterEach(() => {
  vi.unstubAllEnvs();

  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('CommonJS HMR real configuration', () => {
  it.each([
    ['user require', "require('vite').defineConfig({ base: '/kept/', server: { port: 3000 } })"],
    ['object', "{ base: '/kept/', server: { port: 3000 } }"],
    ['function', "() => ({ base: '/kept/', server: { port: 3000 } })"],
    ['async function', "async () => ({ base: '/kept/', server: { port: 3000 } })"],
    ['promise', "Promise.resolve({ base: '/kept/', server: { port: 3000 } })"],
  ])('preserves %s through HMR and API', async (_name, expression) => {
    const source = `module.exports = ${expression};`;
    const { dir, file } = fixture(source);
    const env = { command: 'build' as const, mode: 'production' };
    const original = await loadConfigFromFile(env, file, dir);
    expect(original?.config.base).toBe('/kept/');
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');

    const repaired = ensureViteHmrConfig(source);
    writeFileSync(file, repaired);

    const hmr = await loadConfigFromFile(env, file, dir);
    expect(hmr?.config.base).toBe('/kept/');
    expect(hmr?.config.server).toMatchObject({ port: 5173, hmr: { clientPort: 443 } });
    writeFileSync(file, ensureViteApiServeConfig(repaired));

    const composed = await loadConfigFromFile(env, file, dir);
    expect(composed?.config.base).toBe('/kept/');
    expect(composed?.config.server).toMatchObject({ port: 5173, hmr: { clientPort: 443 } });
    expect(composed?.config.plugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'ecode-api-dev-serve' })]),
    );
  });

  it.each(["{ base: '/kept/' }", "() => ({ base: '/kept/' })", "Promise.resolve({ base: '/kept/' })"])(
    'compiles emitted CommonJS under strict checkJs: %s',
    (expression) => {
      const { dir, file } = fixture(ensureViteHmrConfig(`module.exports = ${expression};`));
      writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'Node16',
            moduleResolution: 'Node16',
            strict: true,
            allowJs: true,
            checkJs: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
          },
          include: ['vite.config.cjs'],
        }),
      );

      const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', dir], {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);

      const current = readFileSync(file, 'utf8');
      expect(ensureViteHmrConfig(current)).toBe(current);
    },
  );

  it.each([
    ['cjs', 'module.exports ='],
    ['cts', 'module.exports ='],
    ['cts', 'export default'],
  ])('discovers, compiles and loads %s %s through manifest repair', async (extension, assignment) => {
    const name = `vite.config.${extension}`;
    const source = `${assignment} async () => ({ base: '/manifest/', server: { port: 3000 } });`;
    const { dir, file } = fixture(source, extension);

    const repaired = buildPreviewManifestRepair({
      'package.json': JSON.stringify({ type: 'commonjs', dependencies: { react: '^18.3.1', vite: '^5.4.19' } }),
      'src/main.ts': 'export const value = 1;',
      [name]: source,
    });
    expect(repaired.supplementalFiles.filter((f) => f.path.startsWith('vite.config.')).map((f) => f.path)).toEqual([
      name,
    ]);
    writeFileSync(file, repaired.supplementalFiles.find((f) => f.path === name)!.content);
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'Node16',
          moduleResolution: 'Node16',
          strict: true,
          allowJs: true,
          checkJs: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: [name],
      }),
    );

    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', dir], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');

    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, file, dir);
    expect(loaded?.config.base).toBe('/manifest/');
    expect(loaded?.config.server).toMatchObject({ port: 5173, hmr: { clientPort: 443 } });
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('migrates legacy CommonJS (pinned=%s, API=%s) without losing settings', async (pinned, api) => {
    const legacy = `const { mergeConfig: __ecodeMergeConfig } = require('vite');
const __ecodeHmrOverride = { server: { host: true, ...(process.env.VITE_HMR_CLIENT_PORT ? { ${pinned ? 'port: 5173, strictPort: true,' : ''} hmr: { clientPort: 443 } } : {}) } };
const __ecodeUserConfig = { base: '/legacy/' };
module.exports = typeof __ecodeUserConfig === 'function'
  ? (env) => __ecodeMergeConfig(__ecodeUserConfig(env), __ecodeHmrOverride)
  : __ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride);
`;
    const composed = `const { mergeConfig: __ecodeApiMergeConfig } = require('vite');
const __ecodeApiDevServe = { name: 'ecode-api-dev-serve', configureServer() {} };
const __ecodeApiServeOverride = { plugins: [__ecodeApiDevServe] };
${legacy.replace('module.exports = ', 'const __ecodeApiUserConfig = ')}
module.exports = typeof __ecodeApiUserConfig === 'function'
  ? (env) => __ecodeApiMergeConfig(__ecodeApiUserConfig(env), __ecodeApiServeOverride)
  : __ecodeApiMergeConfig(__ecodeApiUserConfig, __ecodeApiServeOverride);
`;

    const { dir, file } = fixture(api ? composed : legacy);
    const output = ensureViteApiServeConfig(ensureViteHmrConfig(api ? composed : legacy));

    // Do not add API wiring when it was absent from the original config.
    const repaired = api ? output : ensureViteHmrConfig(legacy);
    writeFileSync(file, repaired);
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');

    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, file, dir);
    expect(loaded?.config.base).toBe('/legacy/');
    expect(loaded?.config.server).toMatchObject({ port: 5173, strictPort: true });
    expect(ensureViteHmrConfig(repaired)).toBe(repaired);

    if (api) {
      expect(ensureViteApiServeConfig(repaired)).toBe(repaired);
    }
  });

  it.each(['first-lot', 'legacy', 'fallback'])('compiles and loads a cts %s migration', async (kind) => {
    const legacy = `import { mergeConfig as __ecodeMergeConfig } from 'vite';
const __ecodeHmrOverride = { server: { host: true, ...(process.env.VITE_HMR_CLIENT_PORT ? { port: 5173, strictPort: true } : {}) } };
const __ecodeUserConfig = { base: '/migrated/' };
export default typeof __ecodeUserConfig === 'function'
  ? (env) => __ecodeMergeConfig(__ecodeUserConfig(env), __ecodeHmrOverride)
  : __ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride);
`;
    const source =
      kind === 'legacy'
        ? legacy
        : kind === 'first-lot'
          ? ensureViteHmrConfig("export default { base: '/migrated/' };")
          : 'const config = {};';

    const repaired = ensureViteHmrConfig(source, 'vite.config.cts');
    const { dir, file } = fixture(repaired, 'cts');
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'Node16',
          moduleResolution: 'Node16',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: ['vite.config.cts'],
      }),
    );

    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', dir], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');

    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, file, dir);

    if (kind !== 'fallback') {
      expect(loaded?.config.base).toBe('/migrated/');
    }

    expect(loaded?.config.server).toMatchObject({ port: 5173, strictPort: true });
    expect(ensureViteHmrConfig(repaired, 'vite.config.cts')).toBe(repaired);
  });
});
