import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeReactManifestRepair,
  detectPodPackageManager,
  runWorkspaceStaticBuild,
  splitBuildCommand,
  DEPLOY_REACT18_RANGE,
  type WorkspaceBuildAgent,
} from './deploy-workspace-build.js';

const tmpDirs: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

async function materializeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wsbuild-'));
  tmpDirs.push(dir);

  return dir;
}

/** A configurable fake workspace-agent. */
function fakeAgent(overrides: Partial<WorkspaceBuildAgent> = {}): WorkspaceBuildAgent {
  return {
    runStep: vi.fn(async () => ({ exitCode: 0, timedOut: false })),
    listFiles: vi.fn(async () => ({ files: [] })),
    readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
    ...overrides,
  };
}

const baseOptions = {
  install: { command: 'npm', args: ['install'] },
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  cwd: '.',
  maxFileBytes: 2 * 1024 * 1024,
  artifactSizeLimitMb: 250,
};

describe('detectPodPackageManager', () => {
  it('picks pnpm/yarn/bun by lockfile and defaults to npm', () => {
    expect(detectPodPackageManager(['dist/x', 'pnpm-lock.yaml']).manager).toBe('pnpm');
    expect(detectPodPackageManager(['yarn.lock']).manager).toBe('yarn');
    expect(detectPodPackageManager(['bun.lockb']).manager).toBe('bun');
    expect(detectPodPackageManager(['package.json']).manager).toBe('npm');
  });
});

describe('splitBuildCommand', () => {
  it('splits command + args and honors quotes', () => {
    expect(splitBuildCommand('npm run build')).toEqual({ command: 'npm', args: ['run', 'build'] });
    expect(splitBuildCommand('vite build --mode "prod env"')).toEqual({
      command: 'vite',
      args: ['build', '--mode', 'prod env'],
    });
    expect(splitBuildCommand('   ')).toBeUndefined();
  });
});

describe('runWorkspaceStaticBuild', () => {
  it('builds, validates index.html, and materializes the artifact locally', async () => {
    const dir = await materializeDir();

    const agent = fakeAgent({
      listFiles: vi.fn(async () => ({
        files: [
          { path: 'dist/index.html', size: 20 },
          { path: 'dist/assets/app.js', size: 10 },
          { path: 'dist/logo.png', size: 4 },
        ],
      })),
      readFile: vi.fn(async (filePath: string) => {
        if (filePath === 'dist/index.html') {
          return { content: '<html>quiz</html>', encoding: 'utf8' as const };
        }

        if (filePath === 'dist/assets/app.js') {
          return { content: 'console.log(1)', encoding: 'utf8' as const };
        }

        // a binary asset delivered base64
        return { content: Buffer.from([1, 2, 3, 4]).toString('base64'), encoding: 'base64' as const };
      }),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);

    expect(result.ok).toBe(true);
    expect(result.outputDir).toBe(dir);
    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe('<html>quiz</html>');
    expect(await readFile(join(dir, 'assets/app.js'), 'utf8')).toBe('console.log(1)');

    // base64 asset decoded to raw bytes
    expect((await stat(join(dir, 'logo.png'))).size).toBe(4);

    // the React-18 manifest guard runs first (node), then install (npm) before build.
    const runCalls = (agent.runStep as ReturnType<typeof vi.fn>).mock.calls;
    expect(runCalls[0][0].command).toBe('node');
    expect(runCalls[0][0].args[0]).toBe('-e');
    expect(runCalls[0][0].args[1]).toContain('[react18-guard]');
    expect(runCalls[1][0].command).toBe('npm');
  });

  it('isolates install+build in a sandbox so the live workspace is never mutated', async () => {
    const dir = await materializeDir();
    const calls: { command: string; cwd: string; args: string[] }[] = [];

    const agent = fakeAgent({
      runStep: vi.fn(async ({ command, cwd, args }: { command: string; cwd: string; args: string[] }) => {
        calls.push({ command, cwd, args });
        return { exitCode: 0, timedOut: false };
      }),
      listFiles: vi.fn(async (path: string) => ({
        files: path === '.deploy-x/dist' ? [{ path: '.deploy-x/dist/index.html', size: 12 }] : [],
      })),
      readFile: vi.fn(async () => ({ content: '<html></html>', encoding: 'utf8' as const })),
    });

    const result = await runWorkspaceStaticBuild(
      { ...baseOptions, materializeDir: dir, sandboxDir: '.deploy-x' },
      agent,
    );

    expect(result.ok).toBe(true);

    // First step copies the sources into the sandbox (never `npm install` in place), excluding node_modules.
    expect(calls[0].command).toBe('sh');
    expect(calls[0].cwd).toBe('.');
    expect(calls[0].args[1]).toContain('! -name node_modules');
    expect(calls[0].args[1]).toContain('.deploy-x');
    expect(calls[0].args[1]).toContain('[deploy-audit] source entries=');
    expect(calls[0].args[1]).toContain('[deploy-audit] sandbox entries=');

    // React-18 manifest guard, then install + build, all INSIDE the sandbox (never the live root).
    expect(calls[1]).toMatchObject({ command: 'node', cwd: '.deploy-x' });
    expect(calls[2]).toMatchObject({ command: 'npm', cwd: '.deploy-x' });
    expect(calls[3].cwd).toBe('.deploy-x');

    // the artifact is enumerated from the sandbox output dir.
    expect(agent.listFiles as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('.deploy-x/dist');

    // the sandbox is torn down afterwards.
    const last = calls[calls.length - 1];
    expect(last.command).toBe('sh');
    expect(last.args[1]).toContain('rm -rf ".deploy-x"');
  });

  it('persists the exact deployment/project/runtime target without exposing file contents', async () => {
    const dir = await materializeDir();
    const logged: string[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(async () => ({ exitCode: 86, timedOut: false })),
    });

    await runWorkspaceStaticBuild(
      {
        ...baseOptions,
        materializeDir: dir,
        sandboxDir: '.deploy-audit',
        diagnosticContext: {
          deploymentId: 'deploy-1',
          projectId: 'project-1',
          runtimeWorkspaceId: 'ws-runtime-1',
          requestedProjectWorkspaceId: 'workspace-checkout-1',
        },
        onLog: (entry) => logged.push(entry.message),
      },
      agent,
    );

    expect(logged[0]).toBe(
      'Workspace deploy audit: deployment=deploy-1 project=project-1 runtimeWorkspace=ws-runtime-1 ' +
        'requestedProjectWorkspace=workspace-checkout-1 sourceCwd=.',
    );
  });

  it('executes the real prepare script and records both source and sandbox postconditions', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'wsbuild-source-'));
    tmpDirs.push(workspaceDir);
    await writeFile(join(workspaceDir, 'package.json'), '{"scripts":{"build":"vite build"}}\n');
    await writeFile(join(workspaceDir, 'README.md'), '# audited source\n');

    const dir = await materializeDir();
    const logged: string[] = [];
    let step = 0;
    const agent = fakeAgent({
      runStep: vi.fn(
        async ({
          command,
          args,
          onLine,
        }: {
          command: string;
          args: string[];
          onLine: (level: 'info' | 'error', line: string) => void;
        }) => {
          step += 1;

          if (command === 'sh') {
            try {
              const result = await execFileAsync(command, args, { cwd: workspaceDir });

              for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
                onLine('info', line);
              }

              return { exitCode: 0, timedOut: false };
            } catch (error) {
              return {
                exitCode: Number((error as { code?: number }).code ?? 1),
                timedOut: false,
              };
            }
          }

          /* Stop after the audited copy; the test is not exercising npm itself. */
          return { exitCode: step >= 3 ? 1 : 0, timedOut: false };
        },
      ),
    });

    const result = await runWorkspaceStaticBuild(
      {
        ...baseOptions,
        materializeDir: dir,
        sandboxDir: '.deploy-real-audit',
        onLog: (entry) => logged.push(entry.message),
      },
      agent,
    );

    expect(result.error).toBe('INSTALL_FAILED');
    expect(logged).toContain('[prepare] [deploy-audit] source entries=2 packageJson=true');
    expect(logged).toContain('[prepare] [deploy-audit] sandbox entries=2 packageJson=true');
    await expect(stat(join(workspaceDir, '.deploy-real-audit'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    [86, 'SOURCE_WORKSPACE_EMPTY'],
    [87, 'SOURCE_PACKAGE_JSON_MISSING'],
    [88, 'SANDBOX_PREPARE_EMPTY'],
    [89, 'SANDBOX_PACKAGE_JSON_MISSING'],
  ] as const)('fails before install with factual prepare postcondition code %s -> %s', async (exitCode, code) => {
    const dir = await materializeDir();
    const calls: string[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(async ({ command }: { command: string }) => {
        calls.push(command);
        return { exitCode: command === 'sh' && calls.length === 1 ? exitCode : 0, timedOut: false };
      }),
    });

    const result = await runWorkspaceStaticBuild(
      { ...baseOptions, materializeDir: dir, sandboxDir: '.deploy-postcondition' },
      agent,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe(code);
    expect(calls).not.toContain('npm');
    expect(calls.at(-1)).toBe('sh'); // finally cleanup remains idempotent
  });

  it('tears down the sandbox even when the build fails', async () => {
    const dir = await materializeDir();
    const calls: { command: string; args: string[] }[] = [];

    const agent = fakeAgent({
      runStep: vi.fn(async ({ command, args }: { command: string; args: string[]; cwd: string }) => {
        calls.push({ command, args });

        // prepare (sh) + install (npm) succeed; the build fails.
        return { exitCode: command === 'sh' || args[0] === 'install' ? 0 : 1, timedOut: false };
      }),
    });

    const result = await runWorkspaceStaticBuild(
      { ...baseOptions, materializeDir: dir, sandboxDir: '.deploy-y' },
      agent,
    );

    expect(result.ok).toBe(false);

    const last = calls[calls.length - 1];
    expect(last.command).toBe('sh');
    expect(last.args[1]).toContain('rm -rf ".deploy-y"');
  });

  it('streams logs via onLog and reports phase transitions', async () => {
    const dir = await materializeDir();
    const phases: string[] = [];
    const logged: string[] = [];

    const agent = fakeAgent({
      runStep: vi.fn(async ({ onLine }: { onLine: (level: 'info' | 'error', line: string) => void }) => {
        onLine('info', 'step output');
        return { exitCode: 0, timedOut: false };
      }),
      listFiles: vi.fn(async () => ({ files: [{ path: 'dist/index.html', size: 5 }] })),
      readFile: vi.fn(async () => ({ content: '<html></html>', encoding: 'utf8' as const })),
    });

    const result = await runWorkspaceStaticBuild(
      {
        ...baseOptions,
        materializeDir: dir,
        onLog: (log) => logged.push(log.message),
        onPhase: (phase) => phases.push(phase),
      },
      agent,
    );

    expect(result.ok).toBe(true);
    expect(phases).toEqual(['installing', 'building', 'deploying']);
    expect(logged.some((m) => m.includes('step output'))).toBe(true);
  });

  it('fails clearly when install fails', async () => {
    const dir = await materializeDir();

    const agent = fakeAgent({
      runStep: vi.fn(async ({ command }: { command: string }) =>
        command === 'npm' ? { exitCode: 1, timedOut: false } : { exitCode: 0, timedOut: false },
      ),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INSTALL_FAILED');
  });

  it('maps a non-zero build exit to BUILD_FAILED and a timeout to BUILD_TIMEOUT', async () => {
    const dir = await materializeDir();

    let call = 0;

    const agent = fakeAgent({
      runStep: vi.fn(async () => {
        call += 1;
        // call 1 = React-18 guard, call 2 = install (both succeed); call 3 = build (times out).
        return call <= 2 ? { exitCode: 0, timedOut: false } : { exitCode: null, timedOut: true };
      }),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);
    expect(result.error).toBe('BUILD_TIMEOUT');
  });

  it('returns NOT_STATIC_SITE when the build produces no index.html (full-stack app)', async () => {
    const dir = await materializeDir();

    const agent = fakeAgent({
      listFiles: vi.fn(async () => ({ files: [{ path: 'dist/server.js', size: 100 }] })),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('NOT_STATIC_SITE');
    expect(result.logs.some((l) => /isn't a static site/.test(l.message))).toBe(true);
  });

  it('returns OUTPUT_DIRECTORY_MISSING when the output dir is empty', async () => {
    const dir = await materializeDir();
    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, fakeAgent());
    expect(result.error).toBe('OUTPUT_DIRECTORY_MISSING');
  });

  it('rejects a single file above the per-file transfer cap', async () => {
    const dir = await materializeDir();

    const agent = fakeAgent({
      listFiles: vi.fn(async () => ({
        files: [
          { path: 'dist/index.html', size: 20 },
          { path: 'dist/huge.mp4', size: 5 * 1024 * 1024 },
        ],
      })),
      readFile: vi.fn(async () => ({ content: '<html></html>', encoding: 'utf8' as const })),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ARTIFACT_FILE_TOO_LARGE');
  });

  it('surfaces an unreachable agent instead of a silent failure', async () => {
    const dir = await materializeDir();

    const agent = fakeAgent({
      runStep: vi.fn(async () => ({ exitCode: null, timedOut: false, error: 'WORKSPACE_AGENT_REQUEST_FAILED' })),
    });

    const result = await runWorkspaceStaticBuild({ ...baseOptions, materializeDir: dir }, agent);
    expect(result.error).toBe('AGENT_UNREACHABLE');
  });
});

describe('computeReactManifestRepair (P0-2 deploy guard)', () => {
  it('is a no-op when the sources do not use the React-18 client API', () => {
    const r = computeReactManifestRepair({ dependencies: { react: '^17.0.0' } }, false);
    expect(r.changed).toBe(false);
    expect(r.forced).toEqual({});
  });

  it('forces a below-18 react/react-dom pin up to the supported range', () => {
    const r = computeReactManifestRepair({ dependencies: { react: '^17.0.2', 'react-dom': '17.0.2' } }, true);
    expect(r.changed).toBe(true);
    expect(r.forced).toEqual({ react: DEPLOY_REACT18_RANGE, 'react-dom': DEPLOY_REACT18_RANGE });
  });

  it('adds react-dom when it is omitted entirely (the real react-notes-app failure)', () => {
    // src/main.tsx imports react-dom/client but package.json has no react-dom → the
    // deploy build died with `Rollup failed to resolve import "react-dom/client"`.
    const r = computeReactManifestRepair({ dependencies: { react: '^18.3.1' } }, true);
    expect(r.forced).toEqual({ 'react-dom': DEPLOY_REACT18_RANGE });
    expect(r.changed).toBe(true);
  });

  it('leaves an already >=18 pin untouched (incl. an intentional React 19 app)', () => {
    expect(
      computeReactManifestRepair({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } }, true).changed,
    ).toBe(false);
    expect(
      computeReactManifestRepair({ dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } }, true).changed,
    ).toBe(false);
  });

  it('does not downgrade a pin declared in devDependencies with a fine floor', () => {
    const r = computeReactManifestRepair(
      { dependencies: {}, devDependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' } },
      true,
    );
    expect(r.changed).toBe(false);
  });
});
