import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectPodPackageManager,
  runWorkspaceStaticBuild,
  splitBuildCommand,
  type WorkspaceBuildAgent,
} from './deploy-workspace-build.js';

const tmpDirs: string[] = [];

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
    // install ran before build
    expect((agent.runStep as ReturnType<typeof vi.fn>).mock.calls[0][0].command).toBe('npm');
  });

  it('streams logs via onLog and reports phase transitions', async () => {
    const dir = await materializeDir();
    const phases: string[] = [];
    const logged: string[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(
        async ({ onLine }: { onLine: (level: 'info' | 'error', line: string) => void }) => {
          onLine('info', 'step output');
          return { exitCode: 0, timedOut: false };
        },
      ),
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
        return call === 1 ? { exitCode: 0, timedOut: false } : { exitCode: null, timedOut: true };
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
