import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPreviewManifestRepair } from './preview-manifest';
import { ensureViteApiServeConfig } from './vite-api-serve';
import { ensureViteHmrConfig } from './vite-hmr-config';

const repository = process.cwd();
const directories: string[] = [];
const configEnv = { command: 'build' as const, mode: 'production' };

function project(config: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'vibecore-hmr-compile-'));
  directories.push(directory);
  symlinkSync(path.join(repository, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  mkdirSync(path.join(directory, 'src'));

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      private: true,
      type: 'module',
      scripts: { build: 'tsc -b && vite build' },
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { vite: '^5.4.19', typescript: '^5.7.2', '@types/node': '^25.6.0' },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noUnusedParameters: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node', 'vite/client'],
      },
      include: ['src', 'vite.config.ts'],
    }),
    'vite.config.ts': config,
    'index.html': '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    'src/history.ts': 'export const MAX_HISTORY = 10;',
    'src/main.ts':
      'import { MAX_HISTORY } from "./history"; document.querySelector("#app")!.textContent = String(MAX_HISTORY);',
  };

  const repair = buildPreviewManifestRepair(files);

  for (const file of repair.supplementalFiles) {
    files[file.path] = file.content;
  }

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), content);
  }

  return directory;
}

function compile(directory: string) {
  const result = spawnSync(process.execPath, [path.join(repository, 'node_modules/typescript/bin/tsc'), '-b'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();

  return { status: result.status, output: result.stdout + result.stderr };
}

afterEach(() => {
  vi.unstubAllEnvs();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('actual generated HMR config compilation', () => {
  const expressions = [
    ['object', 'defineConfig({ base: "/production/", server: { port: 3000 } })'],
    ['plain function', '() => ({ base: "/production/", server: { port: 3000 } })'],
    ['function', 'defineConfig(({ mode }) => ({ base: `/${mode}/`, server: { port: 3000 } }))'],
    ['zero-argument function', 'defineConfig(() => ({ base: "/production/", server: { port: 3000 } }))'],
    ['async function', 'defineConfig(async ({ mode }) => ({ base: `/${mode}/`, server: { port: 3000 } }))'],
    ['promise', 'Promise.resolve({ base: "/production/", server: { port: 3000 } })'],
  ];

  it.each(expressions)('compiles and loads %s preserving user settings and proxy HMR', async (_name, expression) => {
    const original = `import { defineConfig } from 'vite';\nexport default ${expression};`;
    const directory = project(original);
    const filename = path.join(directory, 'vite.config.ts');
    const repaired = readFileSync(filename, 'utf8');
    writeFileSync(filename, original);
    expect(compile(directory)).toEqual({ status: 0, output: '' });
    writeFileSync(filename, repaired);
    expect(compile(directory)).toEqual({ status: 0, output: '' });
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '');

    const local = await loadConfigFromFile(configEnv, path.join(directory, 'vite.config.ts'), directory);
    expect(local?.config.base).toBe('/production/');
    expect(local?.config.server?.port).toBe(3000);
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');
    vi.stubEnv('VITE_HMR_PROTOCOL', 'wss');
    vi.stubEnv('VITE_HMR_HOST', 'preview.example.test');

    const proxy = await loadConfigFromFile(configEnv, path.join(directory, 'vite.config.ts'), directory);
    expect(proxy?.config.base).toBe('/production/');
    expect(proxy?.config.server).toMatchObject({
      port: 5173,
      strictPort: true,
      hmr: { clientPort: 443, protocol: 'wss', host: 'preview.example.test' },
    });

    const emitted = readFileSync(path.join(directory, 'vite.config.ts'), 'utf8');
    expect(ensureViteHmrConfig(emitted)).toBe(emitted);
  });

  it.each(['js', 'mjs'])('loads emitted configuration as JavaScript (%s)', async (extension) => {
    const directory = project("export default { base: '/javascript/' };");
    const filename = path.join(directory, `vite.config.${extension}`);
    writeFileSync(filename, readFileSync(path.join(directory, 'vite.config.ts')));

    const loaded = await loadConfigFromFile(configEnv, filename, directory);
    expect(loaded?.config.base).toBe('/javascript/');
  });

  const legacy = `import { mergeConfig as __ecodeMergeConfig } from 'vite';
const __ecodeHmrOverride = { server: { host: true, ...(process.env.VITE_HMR_CLIENT_PORT ? { port: 5173, strictPort: true } : {}) } };
const __ecodeUserConfig = { base: '/retained/', server: { port: 3000 } };
export default typeof __ecodeUserConfig === 'function'
  ? (env) => __ecodeMergeConfig(__ecodeUserConfig(env), __ecodeHmrOverride)
  : __ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride);
`;

  it('upgrades an already pinned legacy config and compiles it', async () => {
    const directory = project(legacy);
    expect(compile(directory)).toEqual({ status: 0, output: '' });

    const loaded = await loadConfigFromFile(configEnv, path.join(directory, 'vite.config.ts'), directory);
    expect(loaded?.config.base).toBe('/retained/');

    const emitted = readFileSync(path.join(directory, 'vite.config.ts'), 'utf8');
    expect(ensureViteHmrConfig(emitted)).toBe(emitted);
  });

  it.each([false, true])('preserves effective settings through API composition (legacy=%s)', async (old) => {
    /*
     * The API middleware's full strict typing is a separate open issue. This
     * runtime check guards against merging an unresolved HMR Promise as {}.
     */
    const oldComposed = `import { mergeConfig as __ecodeApiMergeConfig } from 'vite';
const __ecodeApiDevServe = { name: 'ecode-api-dev-serve', configureServer() {} };
const __ecodeApiServeOverride = { plugins: [__ecodeApiDevServe] };
${legacy.replace('export default ', 'const __ecodeApiUserConfig = ')}
export default typeof __ecodeApiUserConfig === 'function'
  ? (env) => __ecodeApiMergeConfig(__ecodeApiUserConfig(env), __ecodeApiServeOverride)
  : __ecodeApiMergeConfig(__ecodeApiUserConfig, __ecodeApiServeOverride);
`;

    const source = old ? oldComposed : "export default { base: '/retained/', server: { port: 3000 } };";
    const directory = project(source);
    const filename = path.join(directory, 'vite.config.ts');
    const emitted = readFileSync(filename, 'utf8');
    const composed = old ? emitted : ensureViteApiServeConfig(emitted);
    writeFileSync(filename, composed);
    vi.stubEnv('VITE_HMR_CLIENT_PORT', '443');

    const loaded = await loadConfigFromFile(configEnv, filename, directory);
    expect(loaded?.config.base).toBe('/retained/');
    expect(loaded?.config.server).toMatchObject({ port: 5173, strictPort: true });
    expect(loaded?.config.plugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'ecode-api-dev-serve' })]),
    );
    expect(ensureViteApiServeConfig(ensureViteHmrConfig(composed))).toBe(composed);
  });

  it('builds a coherent module graph and rejects a missing export', () => {
    const directory = project("import { defineConfig } from 'vite';\nexport default defineConfig({});");
    expect(compile(directory)).toEqual({ status: 0, output: '' });

    const dependencyState = () =>
      ['typescript', '@types/node', 'vite'].map((name) => {
        const manifest = path.join(repository, 'node_modules', name, 'package.json');
        return { name, manifest: realpathSync(manifest), content: readFileSync(manifest, 'utf8') };
      });

    const beforeBuild = dependencyState();

    /*
     * Resolve Corepack's package manager from the repository, not the unpinned
     * fixture: newer pnpm versions can auto-install into its shared node_modules.
     */

    const built = spawnSync('pnpm', ['--dir', directory, 'run', 'build'], {
      cwd: repository,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' },
    });
    expect(built.error).toBeUndefined();
    expect(dependencyState()).toEqual(beforeBuild);
    expect(built.status, built.stdout + built.stderr).toBe(0);
    expect(readFileSync(path.join(directory, 'dist/index.html'), 'utf8')).toContain('type="module"');
    writeFileSync(path.join(directory, 'src/history.ts'), 'export const OTHER_LIMIT = 10;');

    const missingExport = compile(directory);
    expect(missingExport.status).not.toBe(0);
    expect(missingExport.output).toContain('TS2305');
  });
});
