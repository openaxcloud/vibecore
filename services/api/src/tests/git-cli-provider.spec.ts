import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

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

  it('keeps git graph API scoped to a newly created project workspace', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-api-parent-repo-'));
    const storage = join(parent, '.vibecore-project-storage');

    await execFile('git', ['init', '--initial-branch=main'], { cwd: parent }).catch(async () => {
      await execFile('git', ['init'], { cwd: parent });
      await execFile('git', ['checkout', '-B', 'main'], { cwd: parent });
    });
    await execFile('git', ['config', 'user.name', 'openaxcloud'], { cwd: parent });
    await execFile('git', ['config', 'user.email', 'platform@example.com'], { cwd: parent });
    await mkdir(join(parent, 'app', 'components', 'chat'), { recursive: true });
    await writeFile(join(parent, 'app', 'components', 'chat', 'BaseChat.tsx'), 'platform source');
    await execFile('git', ['add', '--all'], { cwd: parent });
    await execFile('git', ['commit', '-m', 'Agent panel polish'], { cwd: parent });

    process.env.PROJECT_STORAGE_DIR = storage;

    class TestEmailProvider implements EmailProvider {
      readonly messages: EmailMessage[] = [];

      async send(message: EmailMessage) {
        this.messages.push(message);
      }
    }

    const app = await buildApiApp({
      store: new TestApiStore(),
      emailProvider: new TestEmailProvider(),
      projectStorage: new LocalProjectStorage(),
      gitProvider: new GitCliProvider(),
    });

    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'workspace-git-isolation@example.com',
        password: 'password123',
        name: 'Workspace Owner',
        organizationName: 'Workspace Git Org',
      },
    });
    expect(registered.statusCode).toBe(201);

    const auth = registered.json() as { token: string; organization: { id: string } };
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Create a polished portfolio' },
    });
    expect(created.statusCode).toBe(201);

    const projectId = created.json().project.id as string;
    const graph = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/graph`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    const status = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    const files = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(graph.statusCode).toBe(200);
    expect(graph.json().commits).toHaveLength(1);
    expect(graph.json().commits[0].message).toBe('chore: initial scaffold');
    expect(JSON.stringify(graph.json())).not.toContain('Agent panel polish');
    expect(JSON.stringify(graph.json())).not.toContain('openaxcloud');
    expect(status.statusCode).toBe(200);
    expect(status.json().status.changedFiles).toEqual([]);
    expect(status.json().status.changedFiles).not.toContain('app/components/chat/BaseChat.tsx');
    expect(files.statusCode).toBe(200);
    expect(files.json().files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(['README.md', 'index.html', 'package.json', 'src/main.tsx']),
    );
    expect(files.json().files.some((file: { path: string }) => file.path.startsWith('.git/'))).toBe(false);

    await app.close();
  }, 20_000);
});
