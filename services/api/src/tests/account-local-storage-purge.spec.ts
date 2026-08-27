import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { eraseLocalAccountStorage } from '../account-local-storage-purge.js';
import type { PurgeEffectDescriptor, PurgeLeaseContext } from '../account-purge.js';
import { snapshotStaticBuild } from '../deployments.js';
import { GitCliProvider, LocalProjectStorage } from '../project-storage.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

async function exists(path: string): Promise<boolean> {
  return lstat(path)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
}

async function put(path: string, content = 'subject-data'): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function durableLease() {
  const receipts = new Map<string, Record<string, unknown>>();
  const lease: PurgeLeaseContext = {
    planId: 'plan-local-fs',
    ownerToken: 'owner-local-fs',
    validate: async () => undefined,
    executeEffect: async <T extends Record<string, unknown>>(
      descriptor: PurgeEffectDescriptor,
      effect: () => Promise<T>,
    ) => {
      const receipt = receipts.get(descriptor.key);
      if (receipt) return { executed: false, receipt: receipt as T };
      const created = await effect();
      receipts.set(descriptor.key, created);
      return { executed: true, receipt: created };
    },
  };

  return { lease, receipts };
}

describe.sequential('account purge — disposable local filesystem proof', () => {
  it('erases every subject path and preserves unrelated tenant paths', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-fs-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const { lease, receipts } = durableLease();

    const ownedTree = join(projectRoot, 'owned-project', 'src', 'secret.ts');
    const archive = join(projectRoot, '_objects', 'exports', 'owned-project', 'export.zip');
    const checkpoint = join(projectRoot, '_objects', 'snapshots', 'owned-project', 'checkpoint.zip');
    const subjectWorkspace = join(projectRoot, 'shared-project', '.vibecore-workspaces', 'ws-subject', 'private.txt');
    const staticSnapshot = join(staticRoot, 'deployment-subject', 'index.html');
    const otherProject = join(projectRoot, 'other-project', 'keep.txt');
    const otherWorkspace = join(projectRoot, 'shared-project', '.vibecore-workspaces', 'ws-other', 'keep.txt');
    const otherStatic = join(staticRoot, 'deployment-other', 'index.html');

    try {
      await Promise.all([
        put(ownedTree),
        put(archive),
        put(checkpoint),
        put(subjectWorkspace),
        put(staticSnapshot),
        put(otherProject, 'other-tenant'),
        put(otherWorkspace, 'other-collaborator'),
        put(otherStatic, 'other-deployment'),
      ]);

      const outcome = await eraseLocalAccountStorage(
        {
          ownedProjectIds: ['owned-project'],
          workspaceStorage: [{ projectId: 'shared-project', workspaceId: 'ws-subject' }],
          snapshotObjects: [{ projectId: 'owned-project', storageKey: 'snapshots/owned-project/checkpoint.zip' }],
          staticDeploymentIds: ['deployment-subject'],
        },
        { lease, projectRoot, staticRoot },
      );

      expect(outcome.verified).toBe(true);
      expect(outcome.classes).toHaveLength(5);
      expect(outcome.classes.every((entry) => entry.remainingAfterPurge === 0)).toBe(true);
      await expect(exists(join(projectRoot, 'owned-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'exports', 'owned-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'snapshots', 'owned-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, 'shared-project', '.vibecore-workspaces', 'ws-subject'))).resolves.toBe(
        false,
      );
      await expect(exists(join(staticRoot, 'deployment-subject'))).resolves.toBe(false);

      await expect(exists(otherProject)).resolves.toBe(true);
      await expect(exists(otherWorkspace)).resolves.toBe(true);
      await expect(exists(otherStatic)).resolves.toBe(true);
      expect([...receipts.keys()].sort()).toEqual([
        'local-project-archives:owned-project',
        'local-project-checkpoints:owned-project',
        'local-project-storage:owned-project',
        'local-workspace-storage:shared-project:ws-subject',
        'static-deployment-snapshot:deployment-subject',
      ]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('does not certify zero when a path reappears after a durable success receipt', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-resurrection-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const snapshot = join(staticRoot, 'deployment-race', 'index.html');
    const durable = durableLease();
    const inventory = {
      ownedProjectIds: [],
      workspaceStorage: [],
      snapshotObjects: [],
      staticDeploymentIds: ['deployment-race'],
    };

    try {
      await put(snapshot);
      await expect(
        eraseLocalAccountStorage(inventory, { lease: durable.lease, projectRoot, staticRoot }),
      ).resolves.toMatchObject({ verified: true });

      /* Simulate a delayed writer after the first effect committed its receipt. */
      await put(snapshot, 'resurrected');
      const replay = await eraseLocalAccountStorage(inventory, {
        lease: durable.lease,
        projectRoot,
        staticRoot,
      });

      expect(replay.verified).toBe(false);
      expect(replay.classes.find((entry) => entry.dataClass === 'static_deployment_snapshots')).toMatchObject({
        remainingAfterPurge: 1,
      });
      await expect(exists(snapshot)).resolves.toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('waits for already-validated writers, erases their bytes, then fences every late writer', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-writer-race-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const outputDir = join(base, 'static-output');
    const writerRelease = deferred();
    const allWritersValidated = deferred();
    const expectedWriters = new Set([
      'tree-project',
      'archive-project',
      'checkpoint-project',
      'shared-project',
      'static:deployment-stale-writer',
    ]);
    const validatedWriters = new Set<string>();
    let purgeBarrierActive = false;

    const validateWriter = async (resourceId: string) => {
      if (purgeBarrierActive) {
        throw Object.assign(new Error('PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE'), {
          code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
        });
      }

      validatedWriters.add(resourceId);
      if (validatedWriters.size === expectedWriters.size) allWritersValidated.resolve();
      await writerRelease.promise;
    };

    vi.stubEnv('PROJECT_STORAGE_DIR', projectRoot);
    vi.stubEnv('STATIC_DEPLOY_STORAGE_DIR', staticRoot);
    vi.stubEnv('VIBECORE_PROJECT_LOCK', 'disabled');

    try {
      await put(join(outputDir, 'index.html'), '<main>stale writer</main>');
      const storage = new LocalProjectStorage(validateWriter, validateWriter);
      const writers = [
        storage.writeFiles('tree-project', [{ path: 'src/late.ts', content: 'late tree' }]),
        storage.exportZip('archive-project'),
        storage.createSnapshot({
          projectId: 'checkpoint-project',
          storageKey: 'snapshots/checkpoint-project/stale.zip',
          files: [{ path: 'secret.txt', content: 'late checkpoint', updatedAt: new Date().toISOString() }],
        }),
        storage.writeFiles('shared-project', [{ path: 'private.txt', content: 'late workspace' }], 'ws-subject'),
        snapshotStaticBuild('deployment-stale-writer', outputDir, () =>
          validateWriter('static:deployment-stale-writer'),
        ),
      ];

      await allWritersValidated.promise;
      expect(validatedWriters).toEqual(expectedWriters);

      purgeBarrierActive = true;
      let purgeSettled = false;
      const purge = eraseLocalAccountStorage(
        {
          ownedProjectIds: ['tree-project', 'archive-project', 'checkpoint-project'],
          workspaceStorage: [{ projectId: 'shared-project', workspaceId: 'ws-subject' }],
          snapshotObjects: [
            {
              projectId: 'checkpoint-project',
              storageKey: 'snapshots/checkpoint-project/stale.zip',
            },
          ],
          staticDeploymentIds: ['deployment-stale-writer'],
        },
        { lease: durableLease().lease, projectRoot, staticRoot },
      ).finally(() => {
        purgeSettled = true;
      });

      /* The first erasure is queued behind a writer that validated before the plan existed. */
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(purgeSettled).toBe(false);

      writerRelease.resolve();
      await Promise.all(writers);
      await expect(purge).resolves.toMatchObject({ verified: true });

      await expect(exists(join(projectRoot, 'tree-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'exports', 'archive-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'snapshots', 'checkpoint-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, 'shared-project', '.vibecore-workspaces', 'ws-subject'))).resolves.toBe(
        false,
      );
      await expect(exists(join(staticRoot, 'deployment-stale-writer'))).resolves.toBe(false);

      await expect(
        storage.writeFiles('tree-project', [{ path: 'src/resurrected.ts', content: 'blocked' }]),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(storage.exportZip('archive-project')).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });
      await expect(
        storage.createSnapshot({
          projectId: 'checkpoint-project',
          files: [{ path: 'resurrected.txt', content: 'blocked', updatedAt: new Date().toISOString() }],
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(
        storage.writeFiles('shared-project', [{ path: 'resurrected.txt', content: 'blocked' }], 'ws-subject'),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(
        snapshotStaticBuild('deployment-stale-writer', outputDir, () =>
          validateWriter('static:deployment-stale-writer'),
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      /* Even Git read surfaces call ensureRepository(), so they share the writer fence. */
      await expect(new GitCliProvider(validateWriter).logGraph('tree-project')).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });

      await expect(exists(join(projectRoot, 'tree-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'exports', 'archive-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'snapshots', 'checkpoint-project'))).resolves.toBe(false);
      await expect(exists(join(staticRoot, 'deployment-stale-writer'))).resolves.toBe(false);
    } finally {
      writerRelease.resolve();
      vi.unstubAllEnvs();
      await rm(base, { recursive: true, force: true });
    }
  });

  it('rejects a checkpoint key outside its owning project before deleting anything', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-traversal-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const subject = join(projectRoot, 'owned-project', 'keep-until-inventory-valid.txt');

    try {
      await put(subject);
      await expect(
        eraseLocalAccountStorage(
          {
            ownedProjectIds: ['owned-project'],
            workspaceStorage: [],
            snapshotObjects: [{ projectId: 'owned-project', storageKey: 'snapshots/other-project/stolen.zip' }],
            staticDeploymentIds: [],
          },
          { lease: durableLease().lease, projectRoot, staticRoot },
        ),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_LOCAL_SNAPSHOT_KEY_OUTSIDE_PROJECT' });
      await expect(exists(subject)).resolves.toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
