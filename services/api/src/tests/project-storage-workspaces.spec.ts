import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import {
  archiveFiles,
  decodeFileContent,
  detectBinaryBuffer,
  encodeFileBuffer,
  filesFromZipBase64,
  GitCliProvider,
  LocalProjectStorage,
  withProjectLock,
} from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;
const TEST_ORGANIZATION_ID = 'org_project_storage_tests';

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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

describe('NFS project lock lease heartbeat', () => {
  it('keeps a waiter out for an effect longer than the configured stale window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-project-lock-heartbeat-'));
    process.env.PROJECT_STORAGE_DIR = dir;
    const holderEntered = deferred();
    const releaseHolder = deferred();
    let waiterEffects = 0;
    const lockOptions = {
      forceFileLock: true,
      bypassProcessQueue: true,
      staleMs: 80,
      heartbeatMs: 20,
      acquireTimeoutMs: 2_000,
    } as const;

    try {
      const holder = withProjectLock(
        'heartbeat-project',
        async () => {
          holderEntered.resolve();
          await releaseHolder.promise;
        },
        lockOptions,
      );
      await holderEntered.promise;

      const waiter = withProjectLock(
        'heartbeat-project',
        async () => {
          waiterEffects += 1;
        },
        lockOptions,
      );

      await delay(300);
      expect(waiterEffects).toBe(0);

      releaseHolder.resolve();
      await Promise.all([holder, waiter]);
      expect(waiterEffects).toBe(1);
    } finally {
      releaseHolder.resolve();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reclaims a crashed owner whose lock has no heartbeat', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-project-lock-reclaim-'));
    process.env.PROJECT_STORAGE_DIR = dir;
    const locksDir = join(dir, '_locks');
    const lockPath = join(locksDir, 'crashed-project.lock');
    let effects = 0;

    try {
      await mkdir(locksDir, { recursive: true });
      await writeFile(lockPath, 'dead-owner\n', 'utf8');
      const staleTimestamp = new Date(Date.now() - 10_000);
      await utimes(lockPath, staleTimestamp, staleTimestamp);

      await withProjectLock(
        'crashed-project',
        async () => {
          effects += 1;
        },
        {
          forceFileLock: true,
          bypassProcessQueue: true,
          staleMs: 50,
          heartbeatMs: 15,
          acquireTimeoutMs: 1_000,
        },
      );

      expect(effects).toBe(1);
      expect(await pathExists(lockPath)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

class TestEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
  }
}

describe('filesFromZipBase64 bounds decompression (zip-bomb defence)', () => {
  it('round-trips a normal archive', async () => {
    const buffer = await archiveFiles([
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'src/app.ts', content: 'export const x = 1;' },
    ]);
    const files = await filesFromZipBase64(buffer.toString('base64'));
    expect(files).toEqual(
      expect.arrayContaining([
        { path: 'index.html', content: '<h1>hi</h1>', encoding: 'utf8' },
        { path: 'src/app.ts', content: 'export const x = 1;', encoding: 'utf8' },
      ]),
    );
  });

  it('rejects an archive with too many entries', async () => {
    const buffer = await archiveFiles(
      Array.from({ length: 5_001 }, (_, index) => ({ path: `file-${index}.txt`, content: 'x' })),
    );
    await expect(filesFromZipBase64(buffer.toString('base64'))).rejects.toMatchObject({
      code: 'ZIP_TOO_MANY_ENTRIES',
      statusCode: 413,
    });
  });

  it('rejects an archive entry larger than the per-file cap', async () => {
    // A single 30 MB highly-compressible entry (>25 MB cap) keeps the compressed
    // archive tiny — the classic single-entry zip-bomb shape — and is rejected
    // before it is written anywhere.
    const buffer = await archiveFiles([{ path: 'bomb.txt', content: 'a'.repeat(30 * 1024 * 1024) }]);
    await expect(filesFromZipBase64(buffer.toString('base64'))).rejects.toMatchObject({
      code: 'ZIP_FILE_TOO_LARGE',
      statusCode: 413,
    });
  });
});

describe('binary file preservation (#16/#38)', () => {
  // A PNG header + an embedded NUL byte + a high byte that is NOT valid UTF-8.
  const binaryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x42]);

  it('detectBinaryBuffer flags binary and passes text', () => {
    expect(detectBinaryBuffer(binaryBytes)).toBe(true);
    expect(detectBinaryBuffer(Buffer.from('plain text', 'utf8'))).toBe(false);
  });

  it('encodeFileBuffer/decodeFileContent round-trip binary losslessly', () => {
    const encoded = encodeFileBuffer(binaryBytes);
    expect(encoded.encoding).toBe('base64');
    expect(decodeFileContent(encoded.content, encoded.encoding).equals(binaryBytes)).toBe(true);
  });

  it('round-trips a binary file through archive → zip → decode without corruption', async () => {
    const encoded = encodeFileBuffer(binaryBytes);
    const buffer = await archiveFiles([
      { path: 'assets/logo.png', content: encoded.content, encoding: encoded.encoding },
      { path: 'readme.md', content: '# hello' },
    ]);

    const files = await filesFromZipBase64(buffer.toString('base64'));
    const png = files.find((f) => f.path === 'assets/logo.png')!;
    const md = files.find((f) => f.path === 'readme.md')!;

    expect(png.encoding).toBe('base64');
    expect(decodeFileContent(png.content, png.encoding).equals(binaryBytes)).toBe(true);
    expect(md.encoding).toBe('utf8');
    expect(md.content).toBe('# hello');
  });

  it('writes + reads back a binary file through LocalProjectStorage without corruption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-binary-'));
    process.env.PROJECT_STORAGE_DIR = dir;
    const storage = new LocalProjectStorage();
    const encoded = encodeFileBuffer(binaryBytes);

    await storage.writeFiles(
      'proj_bin',
      [{ path: 'img/icon.ico', content: encoded.content, encoding: encoded.encoding }],
      { expectedOrganizationId: TEST_ORGANIZATION_ID },
    );
    const listed = await storage.listFiles('proj_bin', { expectedOrganizationId: TEST_ORGANIZATION_ID });
    const icon = listed.find((f) => f.path === 'img/icon.ico')!;

    expect(icon.encoding).toBe('base64');
    expect(decodeFileContent(icon.content, icon.encoding).equals(binaryBytes)).toBe(true);
  });
});

describe('LocalProjectStorage remix ownership guards', () => {
  it('stops a multi-file target write before the next mutation after ownership is lost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-remix-write-guard-'));
    process.env.PROJECT_STORAGE_DIR = dir;
    const storage = new LocalProjectStorage();
    let guardCalls = 0;

    await expect(
      storage.writeFiles(
        'guarded-target',
        [
          { path: 'first.txt', content: 'first' },
          { path: 'second.txt', content: 'second' },
        ],
        { expectedOrganizationId: TEST_ORGANIZATION_ID },
        async () => {
          guardCalls += 1;

          if (guardCalls === 3) {
            throw Object.assign(new Error('lease lost'), { code: 'REMIX_OWNERSHIP_LOST' });
          }
        },
      ),
    ).rejects.toMatchObject({ code: 'REMIX_OWNERSHIP_LOST' });

    expect(await pathExists(join(dir, 'guarded-target', 'first.txt'))).toBe(true);
    expect(await pathExists(join(dir, 'guarded-target', 'second.txt'))).toBe(false);
  });

  it('does not materialize a source archive when the durable owner is already lost', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vc-remix-snapshot-guard-'));
    process.env.PROJECT_STORAGE_DIR = dir;
    const storage = new LocalProjectStorage();
    const storageKey = 'snapshots/source/remix-job.zip';

    await expect(
      storage.createSnapshot({
        projectId: 'source',
        expectedOrganizationId: TEST_ORGANIZATION_ID,
        files: [{ path: 'index.ts', content: 'export {};', updatedAt: new Date().toISOString() }],
        storageKey,
        guard: async () => {
          throw Object.assign(new Error('lease lost'), { code: 'REMIX_OWNERSHIP_LOST' });
        },
      }),
    ).rejects.toMatchObject({ code: 'REMIX_OWNERSHIP_LOST' });

    expect(await pathExists(join(dir, '_objects', storageKey))).toBe(false);
  });
});

describe('LocalProjectStorage.restoreSnapshot preserves secondary workspaces', () => {
  it('keeps `.vibecore-workspaces/<id>/` intact when the primary tree is restored', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'vibecore-restore-snapshot-'));
    const storage = join(parent, '.vibecore-project-storage');
    process.env.PROJECT_STORAGE_DIR = storage;

    const projectStorage = new LocalProjectStorage();
    const projectId = 'project-with-workspaces';

    await projectStorage.writeFiles(
      projectId,
      [
        { path: 'README.md', content: '# primary tree' },
        { path: 'src/main.ts', content: 'console.log("primary");\n' },
      ],
      { expectedOrganizationId: TEST_ORGANIZATION_ID },
    );

    const workspaceId = 'workspace-alpha';
    const workspacePath = join(storage, projectId, '.vibecore-workspaces', workspaceId);

    await mkdir(join(workspacePath, '.git'), { recursive: true });
    await writeFile(join(workspacePath, '.git', 'HEAD'), 'ref: refs/heads/feature\n');
    await writeFile(join(workspacePath, 'workspace-file.txt'), 'only-in-workspace');

    await projectStorage.restoreSnapshot({
      projectId,
      expectedOrganizationId: TEST_ORGANIZATION_ID,
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

    await projectStorage.writeFiles(projectId, [{ path: 'index.html', content: 'primary' }], {
      expectedOrganizationId: TEST_ORGANIZATION_ID,
    });

    const workspacePath = join(storage, projectId, '.vibecore-workspaces', 'workspace-beta');
    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(workspacePath, 'secret.txt'), 'workspace-only');

    const files = await projectStorage.listFiles(projectId, {
      expectedOrganizationId: TEST_ORGANIZATION_ID,
    });
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

    await projectStorage.writeFiles(projectId, [{ path: 'primary.txt', content: 'primary' }], {
      expectedOrganizationId: TEST_ORGANIZATION_ID,
    });

    await projectStorage.restoreSnapshot({
      projectId,
      expectedOrganizationId: TEST_ORGANIZATION_ID,
      workspaceId,
      files: [{ path: 'app.ts', content: 'workspace-content', updatedAt: new Date().toISOString() }],
    });

    const workspacePath = join(storage, projectId, '.vibecore-workspaces', workspaceId);
    expect(await readFile(join(workspacePath, 'app.ts'), 'utf8')).toBe('workspace-content');

    expect(await pathExists(join(storage, projectId, 'app.ts'))).toBe(false);
    expect(await readFile(join(storage, projectId, 'primary.txt'), 'utf8')).toBe('primary');

    const workspaceFiles = await projectStorage.listFiles(projectId, {
      expectedOrganizationId: TEST_ORGANIZATION_ID,
      workspaceId,
    });
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
        expectedOrganizationId: auth.organization.id,
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
        expectedOrganizationId: auth.organization.id,
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
      expect(await readFile(join(workspacePath, 'docs/changelog.md'), 'utf8')).toBe('# Changelog\n\n- AI edit\n');

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
