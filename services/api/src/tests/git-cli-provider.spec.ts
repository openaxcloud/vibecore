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

describe('GitCliProvider.createPullRequest', () => {
  it('rejects with an honest NOT_SUPPORTED error instead of crashing', async () => {
    const provider = new GitCliProvider();

    await expect(
      provider.createPullRequest({
        projectId: 'project-without-remote',
        title: 'Add feature',
        sourceBranch: 'feature',
        targetBranch: 'main',
      }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('connected GitHub account'),
    });
  });
});

describe('GitCliProvider.commit', () => {
  it('raises a friendly typed error when there is nothing to commit', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-empty-commit-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectId = 'empty-commit-project';
    const projectDir = join(storage, projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'README.md'), '# User project\n');

    const provider = new GitCliProvider();

    // First commit succeeds (README is new).
    await provider.commit({ projectId, message: 'Initial', files: [] });

    // Second commit with no changes must not bubble a raw git failure.
    await expect(provider.commit({ projectId, message: 'No-op', files: [] })).rejects.toMatchObject({
      statusCode: 400,
      code: 'GIT_NOTHING_TO_COMMIT',
    });
  });
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
  }, 120_000);

  it('keeps git history isolated between two workspaces of the same project', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-isolation-'));
    const storage = join(parent, '.vibecore-project-storage');
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
        email: 'isolation@example.com',
        password: 'password123',
        name: 'Isolation Owner',
        organizationName: 'Isolation Org',
      },
    });
    expect(registered.statusCode).toBe(201);

    const auth = registered.json() as { token: string; organization: { id: string } };
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Workspace isolation' },
    });
    expect(created.statusCode).toBe(201);

    const projectId = created.json().project.id as string;

    // Create one workspace. The free plan only allows a single active
    // workspace per organization, so we exercise the resolver + allocation by
    // creating one row and validating gitPath, plus a bogus workspaceId
    // confirming the API rejects mismatches with 404.
    const workspaceResponse = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/workspaces`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Isolated workspace', runtimeMode: 'remote-kubernetes' },
    });
    expect(workspaceResponse.statusCode).toBe(201);
    const workspace = workspaceResponse.json().workspace as { id: string; gitPath?: string };
    expect(workspace.gitPath).toBe(`.vibecore-workspaces/${workspace.id}`);

    const workspaceStatus = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status?workspaceId=${encodeURIComponent(workspace.id)}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(workspaceStatus.statusCode).toBe(200);
    expect(workspaceStatus.json().status.changedFiles).toEqual([]);

    const projectStatus = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(projectStatus.statusCode).toBe(200);

    const bogusWorkspace = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status?workspaceId=does-not-exist`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(bogusWorkspace.statusCode).toBe(404);

    await app.close();
  }, 120_000);

  it('keeps a commit in one workspace out of another workspace of the same project', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-two-workspace-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    class TestEmailProvider implements EmailProvider {
      readonly messages: EmailMessage[] = [];

      async send(message: EmailMessage) {
        this.messages.push(message);
      }
    }

    const store = new TestApiStore();
    const gitProvider = new GitCliProvider();
    const app = await buildApiApp({
      store,
      emailProvider: new TestEmailProvider(),
      projectStorage: new LocalProjectStorage(),
      gitProvider,
    });

    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'two-workspace-isolation@example.com',
        password: 'password123',
        name: 'Two Workspace Owner',
        organizationName: 'Two Workspace Org',
      },
    });
    expect(registered.statusCode).toBe(201);

    const auth = registered.json() as { token: string; organization: { id: string } };
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Two workspace isolation' },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().project.id as string;

    // Workspace A goes through the public endpoint (consumes the free
    // plan's single-workspace allocation). Workspace B is created
    // directly on the store to bypass the quota in tests; the resolver
    // and gitProvider still treat it as a real secondary workspace.
    const workspaceAResponse = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/workspaces`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Workspace A', runtimeMode: 'remote-kubernetes' },
    });
    expect(workspaceAResponse.statusCode).toBe(201);
    const workspaceA = workspaceAResponse.json().workspace as { id: string; gitPath?: string };

    const workspaceB = await store.createWorkspace({
      projectId,
      expectedOrganizationId: auth.organization.id,
      name: 'Workspace B',
      runtimeMode: 'remote-kubernetes',
    });
    expect(workspaceA.gitPath).toBe(`.vibecore-workspaces/${workspaceA.id}`);
    expect(workspaceB.gitPath).toBe(`.vibecore-workspaces/${workspaceB.id}`);

    // The first-created workspace (A) is the primary one and is
    // collapsed onto the project root by resolveGitWorkspaceId. We make
    // workspace B's tree commit something unique. The commit endpoint
    // itself re-syncs the project tree from the persisted IDE manifest
    // (which would wipe B's working copy before staging), so we drive
    // the gitProvider directly here — the audit's concern is whether
    // the per-workspace gitPath actually isolates history, not how the
    // commit endpoint interacts with manifest sync.
    const workspaceBPath = join(storage, projectId, '.vibecore-workspaces', workspaceB.id);
    await mkdir(workspaceBPath, { recursive: true });
    await writeFile(join(workspaceBPath, 'isolation-marker.txt'), 'only-in-workspace-b');

    const commit = await gitProvider.commit({
      projectId,
      workspaceId: workspaceB.id,
      message: 'workspace-b-only-commit',
      files: [],
    });
    expect(commit.message).toBe('workspace-b-only-commit');

    const workspaceBGraph = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/graph?workspaceId=${encodeURIComponent(workspaceB.id)}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(workspaceBGraph.statusCode).toBe(200);
    expect(JSON.stringify(workspaceBGraph.json())).toContain('workspace-b-only-commit');

    const workspaceAGraph = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/graph?workspaceId=${encodeURIComponent(workspaceA.id)}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(workspaceAGraph.statusCode).toBe(200);
    expect(JSON.stringify(workspaceAGraph.json())).not.toContain('workspace-b-only-commit');

    const workspaceAStatus = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/git/status?workspaceId=${encodeURIComponent(workspaceA.id)}`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    expect(workspaceAStatus.statusCode).toBe(200);
    expect(workspaceAStatus.json().status.changedFiles).not.toContain('isolation-marker.txt');

    await app.close();
  }, 120_000);
});
