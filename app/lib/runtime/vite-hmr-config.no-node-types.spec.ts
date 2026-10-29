import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPreviewManifestRepair } from './preview-manifest';
import { ensureViteHmrConfig } from './vite-hmr-config';

const root = process.cwd();
const directories: string[] = [];

const legacyBlock = `const __ecodeHmrOverride = {
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
};`;

function compileWithoutNodeTypes(source: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hmr-no-node-types-'));
  directories.push(directory);
  mkdirSync(path.join(directory, 'node_modules'), { recursive: true });

  // Real package declarations, but no shared node_modules: Vite otherwise pulls Node globals transitively.
  for (const name of ['vite', '@vitejs/plugin-react']) {
    const destination = path.join(directory, 'node_modules', name);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(realpathSync(path.join(root, 'node_modules', name)), destination, { recursive: true });
  }
  writeFileSync(path.join(directory, 'vite.config.ts'), source);
  writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['vite.config.ts'],
    }),
  );

  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', directory], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();

  return { status: result.status, output: result.stdout + result.stderr };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('HMR injection without ambient Node types', () => {
  it('does not add five process-name errors to a valid typed config', () => {
    const original = "import { defineConfig } from 'vite';\nexport default defineConfig({ base: '/kept/' });";
    expect(compileWithoutNodeTypes(original)).toEqual({ status: 0, output: '' });
    expect(compileWithoutNodeTypes(ensureViteHmrConfig(original, 'vite.config.ts'))).toEqual({ status: 0, output: '' });
  });

  it('emits a React scaffold that also compiles without ambient Node types', () => {
    const repair = buildPreviewManifestRepair({
      'package.json': JSON.stringify({ dependencies: { react: '^18.3.1' } }),
      'src/App.tsx': 'export default function App() { return <h1>Fixture</h1>; }',
    });

    const config = repair.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'));
    expect(config).toBeDefined();
    expect(compileWithoutNodeTypes(config!.content)).toEqual({ status: 0, output: '' });
  });

  it.each([false, true])('migrates the exact previous React scaffold (wrapped=%s)', (wrapped) => {
    const files = {
      'package.json': JSON.stringify({ dependencies: { react: '^18.3.1' } }),
      'src/App.tsx': 'export default function App() { return <h1>Fixture</h1>; }',
    };

    const scaffold = buildPreviewManifestRepair(files).supplementalFiles.find((file) =>
      file.path.endsWith('vite.config.ts'),
    )!.content;

    const old = scaffold
      .replace("const __ecodeScaffoldHmrEnv = Reflect.get(globalThis, 'process')?.env ?? {};\n", '')
      .replaceAll('__ecodeScaffoldHmrEnv', 'process.env');

    const source = wrapped ? ensureViteHmrConfig(old, 'vite.config.ts') : old;
    const repaired = buildPreviewManifestRepair({ ...files, 'vite.config.ts': source });
    const config = repaired.supplementalFiles.find((file) => file.path.endsWith('vite.config.ts'))!.content;
    expect(config).not.toContain('process.env');
    expect(compileWithoutNodeTypes(config)).toEqual({ status: 0, output: '' });

    const repeated = buildPreviewManifestRepair({ ...files, 'vite.config.ts': config });
    expect(repeated.supplementalFiles.some((file) => file.path.endsWith('vite.config.ts'))).toBe(false);
  });

  it.each([true, false])('migrates an exact known legacy block (pinned=%s) idempotently', (pinned) => {
    const block = pinned
      ? legacyBlock
      : legacyBlock.replace('          port: 5173,\n          strictPort: true,\n', '');

    const original = `${block}\nexport default __ecodeHmrOverride;`;
    const upgraded = ensureViteHmrConfig(original, 'vite.config.ts');
    expect(upgraded).not.toContain('process.env');
    expect(upgraded).toContain('port: 5173');
    expect(ensureViteHmrConfig(upgraded, 'vite.config.ts')).toBe(upgraded);
    expect(compileWithoutNodeTypes(upgraded)).toEqual({ status: 0, output: '' });
  });

  it('migrates only the owned block and preserves user-authored process.env reads', () => {
    const user =
      'const userPort = process.env.VITE_HMR_CLIENT_PORT;\nexport default { define: { user: process.env.USER_SETTING } };';

    const upgraded = ensureViteHmrConfig(`${legacyBlock}\n${user}`, 'vite.config.ts');
    expect(upgraded).toContain(user);
    expect(upgraded.match(/process\.env/g)).toHaveLength(2);
    expect(ensureViteHmrConfig(upgraded, 'vite.config.ts')).toBe(upgraded);
  });

  it('does not rewrite a customized marker block as if it were the known generated block', () => {
    const customized = `${legacyBlock.replace("|| 'wss'", "|| 'ws'")}\nexport default __ecodeHmrOverride;`;
    expect(ensureViteHmrConfig(customized, 'vite.config.ts')).toBe(customized);
  });
});
