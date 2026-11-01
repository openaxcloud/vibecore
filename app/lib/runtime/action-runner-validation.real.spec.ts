import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';

const healthyApp = 'export default function App() { return "healthy"; }\n';
const invalidApp = 'export default function App() { return <main>unfinished; }';

let directory: string;
let runner: ActionRunner;
let runtime: RuntimeAdapter;
let repairs: ReturnType<typeof vi.fn>;

const action = (id: string, content: string, filePath = 'src/App.tsx'): ActionCallbackData => ({
  messageId: 'isolated-turn',
  artifactId: 'isolated-artifact',
  actionId: id,
  action: { type: 'file', filePath, content },
});

function build() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      npm_config_offline: 'true',
      npm_config_cache: join(directory, '.npm-cache'),
    },
    encoding: 'utf8',
    timeout: 20_000,
  });
  expect(result.status, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`).toBe(0);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'validated-generation-'));
  await mkdir(join(directory, 'src'));
  await symlink(resolve('node_modules'), join(directory, 'node_modules'));
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module', scripts: { build: 'vite build' } }),
  );
  await writeFile(
    join(directory, 'index.html'),
    '<div id="root"></div><script type="module" src="/src/main.ts"></script>',
  );
  await writeFile(
    join(directory, 'src/main.ts'),
    'import App from "./App"; import "./styles.css"; document.getElementById("root")!.textContent = App();',
  );
  await writeFile(join(directory, 'src/App.tsx'), healthyApp);
  await writeFile(join(directory, 'src/styles.css'), '.panel { color: red; }\n');

  // Enable Vite's actual PostCSS parser, without installing or invoking any external plugin.
  await writeFile(
    join(directory, 'postcss.config.mjs'),
    'export default {plugins:[{postcssPlugin:"isolated-parser-fixture",Once(){}}]};',
  );
  repairs = vi.fn(async (url: string) => {
    expect(url).toBe('/api/agent/self-repair');
    return new Response(JSON.stringify({ content: invalidApp }), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', repairs);
  runtime = {
    workdir: directory,
    createDirectory: vi.fn(async (path: string) => {
      await mkdir(join(directory, path), { recursive: true });
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), content);
    }),
    readFile: vi.fn(async (path: string) => ({ content: await readFile(join(directory, path), 'utf8') })),
  } as unknown as RuntimeAdapter;
  runner = new ActionRunner(
    runtime,
    () => ({}) as BoltShell,
    undefined,
    undefined,
    undefined,
    undefined,
    'isolated-fixture',
  );
});

afterEach(async () => {
  runner?.abortAll();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

it('preserves a healthy workspace through invalid streaming and final repair exhaustion, then accepts a valid retry', async () => {
  build();

  const invalid = action('invalid', invalidApp);
  runner.addAction(invalid);
  await runner.runAction(invalid, true);
  expect(await readFile(join(directory, 'src/App.tsx'), 'utf8')).toBe(healthyApp);
  expect(runtime.writeFile).not.toHaveBeenCalled();
  expect(repairs).not.toHaveBeenCalled();
  await runner.runAction(invalid, false);
  expect(repairs).toHaveBeenCalledTimes(2);
  expect(runner.actions.get().invalid.status).toBe('failed');
  expect(runner.consumeConfirmedFileWrite('invalid')).toBeUndefined();
  expect(runtime.writeFile).not.toHaveBeenCalled();
  expect(await readFile(join(directory, 'src/App.tsx'), 'utf8')).toBe(healthyApp);
  build();

  const valid = action('explicit-retry', 'export default function App(){ return "valid retry"; }');
  runner.addAction(valid);
  await runner.runAction(valid, true);
  expect(runtime.writeFile).not.toHaveBeenCalled();
  await runner.runAction(valid, false);
  expect(runner.actions.get()['explicit-retry'].status).toBe('complete');
  expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  expect(await readFile(join(directory, 'src/App.tsx'), 'utf8')).toContain('valid retry');
  expect(runner.consumeConfirmedFileWrite('explicit-retry')?.filePath).toBe('src/App.tsx');
  expect(runner.consumeConfirmedFileWrite('explicit-retry')).toBeUndefined();
  expect(repairs).toHaveBeenCalledTimes(2);
  build();
});

it('rejects truncated CSS without replacing a complete stylesheet or multiplying the repair budget', async () => {
  const baseline = await readFile(join(directory, 'src/styles.css'), 'utf8');
  repairs.mockImplementation(
    async () =>
      new Response(JSON.stringify({ content: '.panel { color: red;' }), {
        headers: { 'content-type': 'application/json' },
      }),
  );

  const invalid = action('css', '.panel { color: red;', 'src/styles.css');
  runner.addAction(invalid);
  await runner.runAction(invalid, true);
  await runner.runAction(invalid, false);
  expect(runner.actions.get().css.status).toBe('failed');
  expect(repairs).toHaveBeenCalledTimes(2);
  expect(runtime.writeFile).not.toHaveBeenCalled();
  expect(await readFile(join(directory, 'src/styles.css'), 'utf8')).toBe(baseline);
  expect(runner.consumeConfirmedFileWrite('css')).toBeUndefined();
  build();
});

it('does not roll back a concurrent valid edit after an invalid repair', async () => {
  const concurrent = 'export default function App(){ return "concurrent edit"; }';
  repairs.mockImplementation(async () => {
    await writeFile(join(directory, 'src/App.tsx'), concurrent);
    return new Response(JSON.stringify({ content: invalidApp }), { headers: { 'content-type': 'application/json' } });
  });

  const invalid = action('concurrent', invalidApp);
  runner.addAction(invalid);
  await runner.runAction(invalid, false);
  expect(runner.actions.get().concurrent.status).toBe('failed');
  expect(await readFile(join(directory, 'src/App.tsx'), 'utf8')).toBe(concurrent);
  expect(runtime.writeFile).not.toHaveBeenCalled();
  build();
});

it('does not repair or write repeated source whose final repaired payload was already validated', async () => {
  repairs.mockImplementation(
    async () =>
      new Response(JSON.stringify({ content: healthyApp }), {
        headers: { 'content-type': 'application/json' },
      }),
  );

  const first = action('repaired-first', invalidApp);
  runner.addAction(first);
  await runner.runAction(first, false);
  expect(runner.actions.get()['repaired-first'].status).toBe('complete');
  expect(repairs).toHaveBeenCalledTimes(1);
  expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  expect(runner.consumeConfirmedFileWrite('repaired-first')?.filePath).toBe('src/App.tsx');

  const duplicate = action('repaired-duplicate', invalidApp);
  runner.addAction(duplicate);
  await runner.runAction(duplicate, false);
  expect(repairs).toHaveBeenCalledTimes(1);
  expect(runtime.writeFile).toHaveBeenCalledTimes(1);
  expect(runner.consumeConfirmedFileWrite('repaired-duplicate')).toBeUndefined();
  build();
});
