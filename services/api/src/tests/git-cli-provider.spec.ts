import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { GitCliProvider } from '../project-storage.js';

const execFile = promisify(execFileCallback);

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

describe('GitCliProvider workspace isolation', () => {
  it('does not traverse into the platform repository when a project has no git directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-parent-repo-'));
    const storage = join(parent, '.vibecore-project-storage');

    await execFile('git', ['init', '--initial-branch=main'], { cwd: parent }).catch(async () => {
      await execFile('git', ['init'], { cwd: parent });
      await execFile('git', ['checkout', '-B', 'main'], { cwd: parent });
    });
    await execFile('git', ['config', 'user.name', 'Platform Developer'], { cwd: parent });
    await execFile('git', ['config', 'user.email', 'platform@example.com'], { cwd: parent });
    await mkdir(join(parent, 'app', 'components'), { recursive: true });
    await writeFile(join(parent, 'app', 'components', 'BaseChat.tsx'), 'platform source');
    await execFile('git', ['add', '--all'], { cwd: parent });
    await execFile('git', ['commit', '-m', 'Internal platform commit'], { cwd: parent });

    process.env.PROJECT_STORAGE_DIR = storage;

    const projectId = 'saas-dashboard';
    const projectDir = join(storage, projectId);

    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'README.md'), '# User project\n');

    const provider = new GitCliProvider();
    const status = await provider.status(projectId);
    const emptyGraph = await provider.logGraph(projectId, 5);

    expect(status.branch).toBe('main');
    expect(status.changedFiles).toEqual(['README.md']);
    expect(status.changedFiles).not.toContain('app/components/BaseChat.tsx');
    expect(emptyGraph).toEqual([]);

    const commit = await provider.commit({
      projectId,
      message: 'Initial user project',
      files: [],
    });
    const graph = await provider.logGraph(projectId, 5);

    expect(commit.message).toBe('Initial user project');
    expect(graph).toHaveLength(1);
    expect(graph[0].message).toBe('Initial user project');
    expect(graph[0].author).toBe('You');
  });
});
