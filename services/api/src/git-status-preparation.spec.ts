import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { GitCliProvider } from './project-storage.js';

const execFile = promisify(execFileCallback);
const previousStorage = process.env.PROJECT_STORAGE_DIR;
const previousTrace = process.env.GIT_TRACE2_EVENT;
const gateVariables = ['PATH', 'STATUS_REAL_GIT', 'STATUS_GATE_DIR'];
const previousGateEnvironment = gateVariables.map((key) => [key, process.env[key]] as const);

let temporary: string | undefined;

afterEach(async () => {
  for (const [key, value] of previousGateEnvironment) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  if (previousStorage === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousStorage;
  }

  if (previousTrace === undefined) {
    delete process.env.GIT_TRACE2_EVENT;
  } else {
    process.env.GIT_TRACE2_EVENT = previousTrace;
  }

  if (temporary) {
    await rm(temporary, { recursive: true, force: true });
  }
});

/*
 * The wrapper only gates the first porcelain command, then execs actual Git.
 * FIFOs establish ordering without replacing any command output or sleeping.
 */
async function gateNextStatus() {
  const { stdout } = await execFile('sh', ['-c', 'command -v git']);
  const directory = join(temporary!, 'gate');
  await mkdir(directory);
  await execFile('mkfifo', [join(directory, 'ready'), join(directory, 'release')]);
  await writeFile(
    join(directory, 'git'),
    `#!/bin/sh
case " $* " in
  *" status --porcelain=v1 "*)
    if mkdir "$STATUS_GATE_DIR/claimed" 2>/dev/null; then
      printf 'ready\\n' > "$STATUS_GATE_DIR/ready"
      read -r permit < "$STATUS_GATE_DIR/release"
    fi
    ;;
esac
exec "$STATUS_REAL_GIT" "$@"
`,
    { mode: 0o755 },
  );
  process.env.STATUS_REAL_GIT = stdout.trim();
  process.env.STATUS_GATE_DIR = directory;
  process.env.PATH = `${directory}:${process.env.PATH}`;

  return {
    ready: readFile(join(directory, 'ready'), 'utf8'),
    release: () => writeFile(join(directory, 'release'), 'continue\n'),
  };
}

async function fixture() {
  temporary = await mkdtemp(join(tmpdir(), 'git-status-preparation-'));
  process.env.PROJECT_STORAGE_DIR = temporary;

  const root = join(temporary, 'project');
  await mkdir(root);
  await writeFile(join(root, 'README.md'), 'Synthetic content\n');

  const provider = new GitCliProvider();
  await provider.commit({ projectId: 'project', message: 'Synthetic initial commit', files: [] });

  return { provider, root };
}

it('prepares once per status while reading real changed files and revalidates on the next call', async () => {
  const { provider, root } = await fixture();
  const trace = join(temporary!, 'trace.jsonl');
  process.env.GIT_TRACE2_EVENT = trace;
  await writeFile(join(root, 'README.md'), 'Updated synthetic content\n');

  for (let index = 0; index < 2; index++) {
    const status = await provider.status('project');
    expect(status.branch).toBe('main');
    expect(status.detached).toBe(false);
    expect(status.fileStatuses).toEqual([{ path: 'README.md', status: 'M' }]);
  }

  const starts = (await readFile(trace, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { event: string; argv?: string[] })
    .filter((entry) => entry.event === 'start')
    .map((entry) => entry.argv!);
  expect(starts.filter((argv) => argv.includes('rev-parse'))).toHaveLength(2);
  expect(starts.filter((argv) => argv.includes('config'))).toHaveLength(4);
  expect(starts).toHaveLength(12);
});

it('rechecks and heals a repository removed after an earlier successful status', async () => {
  const { provider, root } = await fixture();
  expect((await provider.status('project')).changedFiles).toEqual([]);
  await rm(join(root, '.git'), { recursive: true });
  await mkdir(join(root, '.git'));

  const status = await provider.status('project');
  expect(status.branch).toBe('main');
  expect(status.changedFiles).toEqual(['README.md']);
  await provider.commit({ projectId: 'project', message: 'Repaired synthetic repository', files: [] });
  expect((await new GitCliProvider().status('project')).changedFiles).toEqual([]);
});

it('still reports detached HEAD and changes using the actual repository', async () => {
  const { provider, root } = await fixture();
  await execFile('git', ['checkout', '--detach'], { cwd: root });

  const { stdout } = await execFile('git', ['rev-parse', '--short', 'HEAD'], { cwd: root });
  await writeFile(join(root, 'README.md'), 'Detached edit\n');

  const status = await provider.status('project');
  expect(status.detached).toBe(true);
  expect(status.branch).toBe(stdout.trim());
  expect(status.changedFiles).toEqual(['README.md']);
});

it('repairs identity and workspace exclusion again on the next status', async () => {
  const { provider, root } = await fixture();
  await provider.status('project');
  await execFile('git', ['config', 'user.name', 'Changed identity'], { cwd: root });
  await execFile('git', ['config', 'user.email', 'changed@example.test'], { cwd: root });

  const exclude = join(root, '.git', 'info', 'exclude');
  const previous = await readFile(exclude, 'utf8');
  const marker = previous.split('\n').find((line) => line.startsWith('/') && line.endsWith('/'))!;
  expect(marker).toBeTruthy();
  await mkdir(join(root, marker.slice(1, -1), 'secondary'), { recursive: true });
  await writeFile(join(root, marker.slice(1, -1), 'secondary', 'private.txt'), 'Synthetic secondary content');
  await rm(exclude);
  expect((await provider.status('project')).changedFiles).toEqual([]);
  expect((await execFile('git', ['config', 'user.name'], { cwd: root })).stdout.trim()).toBe('You');
  expect((await execFile('git', ['config', 'user.email'], { cwd: root })).stdout.trim()).toBe('you@vibecore.local');
  expect(await readFile(exclude, 'utf8')).toContain(marker);
});

it('reads the same actual changes with two status operations in flight', async () => {
  const { provider, root } = await fixture();
  await writeFile(join(root, 'README.md'), 'Concurrent edit\n');

  const gate = await gateNextStatus();
  const first = provider.status('project');
  await gate.ready;

  try {
    const second = await provider.status('project');
    expect(second.fileStatuses).toEqual([{ path: 'README.md', status: 'M' }]);
  } finally {
    await gate.release();
  }
  expect((await first).fileStatuses).toEqual([{ path: 'README.md', status: 'M' }]);
});

it('observes a concurrent repair after invalidation during status without cached readiness', async () => {
  const { provider, root } = await fixture();
  const gate = await gateNextStatus();
  const first = provider.status('project');
  await gate.ready;

  try {
    await rm(join(root, '.git'), { recursive: true });
    await mkdir(join(root, '.git'));

    const repaired = await new GitCliProvider().status('project');
    expect(repaired.branch).toBe('main');
    expect(repaired.changedFiles).toEqual(['README.md']);
  } finally {
    await gate.release();
  }
  expect((await first).changedFiles).toEqual(['README.md']);
  await provider.commit({ projectId: 'project', message: 'After concurrent repair', files: [] });
  expect((await new GitCliProvider().status('project')).changedFiles).toEqual([]);
});

it('fails honestly when invalidated mid-status and repairs on the next operation', async () => {
  const { provider, root } = await fixture();
  const gate = await gateNextStatus();

  const first = provider.status('project').then(
    (status) => ({ status, error: undefined }),
    (error: Error) => ({ status: undefined, error }),
  );
  await gate.ready;

  try {
    await rm(join(root, '.git'), { recursive: true });
    await mkdir(join(root, '.git'));
  } finally {
    await gate.release();
  }

  const result = await first;
  expect(result.status).toBeUndefined();
  expect(result.error).toBeInstanceOf(Error);
  expect((await provider.status('project')).changedFiles).toEqual(['README.md']);
});
