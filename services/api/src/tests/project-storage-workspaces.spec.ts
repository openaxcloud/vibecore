import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

async function pathExists(path: string) {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

describe('LocalProjectStorage.restoreSnapshot preserves secondary workspaces', () => {
  it('keeps `.vibecore-workspaces/<id>/` intact when the primary tree is restored', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-restore-snapshot-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectStorage = new LocalProjectStorage();
    const projectId = 'project-with-workspaces';

    await projectStorage.writeFiles(projectId, [
      { path: 'README.md', content: '# primary tree' },
      { path: 'src/main.ts', content: 'console.log("primary");\n' },
    ]);

    const workspaceId = 'workspace-alpha';
    const workspacePath = join(storage, projectId, '.vibecore-workspaces', workspaceId);

    await mkdir(join(workspacePath, '.git'), { recursive: true });
    await writeFile(join(workspacePath, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
    await writeFile(join(workspacePath, 'workspace-file.txt'), 'only-in-workspace');

    await projectStorage.restoreSnapshot({
      projectId,
      files: [
        { path: 'README.md', content: '# restored', updatedAt: new Date().toISOString() },
        { path: 'src/other.ts', content: '// fresh content\n', updatedAt: new Date().toISOString() },
      ],
    });

    expect(await pathExists(join(workspacePath, '.git', 'HEAD'))).toBe(true);
    expect(await pathExists(join(workspacePath, 'workspace-file.txt'))).toBe(true);
    expect(await readFile(join(workspacePath, 'workspace-file.txt'), 'utf8')).toBe('only-in-workspace');

    expect(await readFile(join(storage, projectId, 'README.md'), 'utf8')).toBe('# restored');
    expect(await readFile(join(storage, projectId, 'src/other.ts'), 'utf8')).toBe('// fresh content\n');
    expect(await pathExists(join(storage, projectId, 'src/main.ts'))).toBe(false);
  });

  it('listFiles on the primary tree does not leak secondary workspace contents', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-list-files-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectStorage = new LocalProjectStorage();
    const projectId = 'isolated-listing';

    await projectStorage.writeFiles(projectId, [{ path: 'index.html', content: 'primary' }]);

    const workspacePath = join(storage, projectId, '.vibecore-workspaces', 'workspace-beta');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(workspacePath, 'secret.txt'), 'workspace-only');

    const files = await projectStorage.listFiles(projectId);
    const paths = files.map((file) => file.path);

    expect(paths).toContain('index.html');
    expect(paths.some((path) => path.includes('.vibecore-workspaces'))).toBe(false);
    expect(paths.some((path) => path.includes('secret.txt'))).toBe(false);
  });
});

describe('LocalProjectStorage workspace-scoped writes', () => {
  it('writes manifest files into the secondary workspace tree, not the primary', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-workspace-writes-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectStorage = new LocalProjectStorage();
    const projectId = 'workspace-scoped-writes';
    const workspaceId = 'workspace-gamma';

    await projectStorage.writeFiles(projectId, [{ path: 'primary.txt', content: 'primary' }]);

    await projectStorage.restoreSnapshot({
      projectId,
      workspaceId,
      files: [
        { path: 'app.ts', content: 'workspace-content', updatedAt: new Date().toISOString() },
      ],
    });

    const workspacePath = join(storage, projectId, '.vibecore-workspaces', workspaceId);
    expect(await readFile(join(workspacePath, 'app.ts'), 'utf8')).toBe('workspace-content');

    expect(await pathExists(join(storage, projectId, 'app.ts'))).toBe(false);
    expect(await readFile(join(storage, projectId, 'primary.txt'), 'utf8')).toBe('primary');

    const workspaceFiles = await projectStorage.listFiles(projectId, workspaceId);
    expect(workspaceFiles.map((file) => file.path)).toEqual(['app.ts']);
  });
});

describe('git commit endpoint syncs the manifest to the targeted workspace tree', () => {
  it('writes the persisted IDE manifest into the secondary workspace before committing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-commit-manifest-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const store = new TestApiStore();
    const gitProvider = new GitCliProvider();
    const projectStorage = new LocalProjectStorage();
    const app = await buildApiApp({
      store,
      emailProvider: new TestEmailProvider(),
      projectStorage,
      gitProvider,
    });

    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'commit-manifest@example.com',
          password: 'password123',
          name: 'Commit Manifest Owner',
          organizationName: 'Commit Manifest Org',
        },
      });
      expect(registered.statusCode).toBe(201);
      const auth = registered.json() as { token: string; organization: { id: string } };

      const created = await app.inject({
        method: 'POST',
        url: `/orgs/${auth.organization.id}/projects`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name: 'Manifest sync project' },
      });
      expect(created.statusCode).toBe(201);
      const projectId = created.json().project.id as string;

      // Workspace A is the primary (collapses onto the project root).
      // Workspace B is the real secondary workspace we will commit into.
      const workspaceAResponse = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/workspaces`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { name: 'Primary Workspace', runtimeMode: 'remote-kubernetes' },
      });
      expect(workspaceAResponse.statusCode).toBe(201);

      const workspaceB = await store.createWorkspace({
        projectId,
        name: 'Secondary Workspace',
        runtimeMode: 'remote-kubernetes',
      });

      // Persist a file manifest into the project's IDE state — this is what
      // the commit handler must reflect onto disk for workspace B's tree
      // before staging.
      const manifestEntries = [
        { path: 'src/agent-output.ts', content: 'export const value = "from-manifest";\n' },
        { path: 'docs/changelog.md', content: '# Changelog\n\n- AI edit\n' },
      ];
      await store.upsertProjectIdeState({
        projectId,
        state: {
          files: {
            entries: manifestEntries,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // Pre-create the secondary workspace tree with stale content so we can
      // observe that the manifest replaces it (instead of being written to the
      // primary tree where the commit would not see it).
      const workspacePath = join(storage, projectId, '.vibecore-workspaces', workspaceB.id);
      await mkdir(join(workspacePath, 'src'), { recursive: true });
      await writeFile(join(workspacePath, 'src/agent-output.ts'), 'stale-content');

      const commitResponse = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/git/commit`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { message: 'AI edit in secondary workspace', workspaceId: workspaceB.id },
      });
      expect(commitResponse.statusCode).toBe(200);
      expect(commitResponse.json().commit.message).toBe('AI edit in secondary workspace');

      expect(await readFile(join(workspacePath, 'src/agent-output.ts'), 'utf8')).toBe(
        'export const value = "from-manifest";\n',
      );
      expect(await readFile(join(workspacePath, 'docs/changelog.md'), 'utf8')).toBe(
        '# Changelog\n\n- AI edit\n',
      );

      // The primary tree must NOT have received the manifest writes.
      expect(await pathExists(join(storage, projectId, 'src/agent-output.ts'))).toBe(false);
      expect(await pathExists(join(storage, projectId, 'docs/changelog.md'))).toBe(false);

      const workspaceGraph = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/git/graph?workspaceId=${encodeURIComponent(workspaceB.id)}`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(workspaceGraph.statusCode).toBe(200);
      expect(JSON.stringify(workspaceGraph.json())).toContain('AI edit in secondary workspace');
    } finally {
      await app.close();
    }
  }, 120_000);
});
