import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { eraseLocalAccountStorage } from '../account-local-storage-purge.js';
import type { PurgeEffectDescriptor, PurgeLeaseContext } from '../account-purge.js';
import { restoreStaticSnapshotInto, snapshotStaticBuild } from '../deployments.js';
import { GitCliProvider, LocalProjectStorage, withProjectLock } from '../project-storage.js';
import type { ProjectMutationCoordinator } from '../project-storage.js';

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
          staticArtifactRefs: [],
          staticAliasDeploymentIds: ['deployment-subject'],
        },
        { lease, projectRoot, staticRoot },
      );

      expect(outcome.verified).toBe(true);
      expect(outcome.classes).toHaveLength(7);
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
      staticArtifactRefs: [],
      staticAliasDeploymentIds: ['deployment-race'],
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

  it('erases sole-owner artifacts and every alias edge while retaining only a live shared digest', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-static-artifacts-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const soleDigest = 'a'.repeat(64);
    const sharedDigest = 'b'.repeat(64);
    const soleRef = `static-artifacts/sha256/${soleDigest}`;
    const sharedRef = `static-artifacts/sha256/${sharedDigest}`;
    const solePath = join(staticRoot, '.artifacts', 'sha256', soleDigest, 'index.html');
    const sharedPath = join(staticRoot, '.artifacts', 'sha256', sharedDigest, 'index.html');
    const sourceAlias = join(staticRoot, '.aliases', 'purged-source');
    const inboundAlias = join(staticRoot, '.aliases', 'outside-source');
    const unrelatedAlias = join(staticRoot, '.aliases', 'outside-keep');
    const durable = durableLease();

    try {
      await Promise.all([
        put(solePath, 'sole bytes'),
        put(sharedPath, 'shared bytes'),
        put(sourceAlias, 'outside-target\n'),
        put(inboundAlias, 'purged-target\n'),
        put(unrelatedAlias, 'outside-target\n'),
      ]);

      const outcome = await eraseLocalAccountStorage(
        {
          ownedProjectIds: [],
          workspaceStorage: [],
          snapshotObjects: [],
          staticDeploymentIds: [],
          staticArtifactRefs: [soleRef, sharedRef],
          staticAliasDeploymentIds: ['purged-source', 'purged-target'],
        },
        {
          lease: durable.lease,
          projectRoot,
          staticRoot,
          isStaticArtifactRetainedOutsidePurge: async (artifactRef) => artifactRef === sharedRef,
        },
      );

      expect(outcome.verified).toBe(true);
      expect(outcome.classes).toHaveLength(8);
      expect(outcome.classes.find(({ dataClass }) => dataClass === 'shared_static_release_artifacts')).toMatchObject({
        action: 'retained',
        reason: expect.any(String),
      });
      await expect(exists(solePath)).resolves.toBe(false);
      await expect(exists(sharedPath)).resolves.toBe(true);
      await expect(exists(sourceAlias)).resolves.toBe(false);
      await expect(exists(inboundAlias)).resolves.toBe(false);
      await expect(exists(unrelatedAlias)).resolves.toBe(true);
      expect([...durable.receipts.keys()]).toEqual(
        expect.arrayContaining([
          `static-release-artifact:${soleDigest}`,
          'static-routing-alias:purged-source',
          'static-routing-alias:outside-source',
        ]),
      );
      expect(durable.receipts.has(`static-release-artifact:${sharedDigest}`)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('does not certify a routing alias recreated after its durable erasure receipt', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-purge-static-alias-replay-'));
    const projectRoot = join(base, 'projects');
    const staticRoot = join(base, 'static');
    const aliasPath = join(staticRoot, '.aliases', 'purged-source');
    const durable = durableLease();
    const inventory = {
      ownedProjectIds: [],
      workspaceStorage: [],
      snapshotObjects: [],
      staticDeploymentIds: [],
      staticArtifactRefs: [],
      staticAliasDeploymentIds: ['purged-source'],
    };

    try {
      await put(aliasPath, 'outside-target\n');
      await expect(
        eraseLocalAccountStorage(inventory, { lease: durable.lease, projectRoot, staticRoot }),
      ).resolves.toMatchObject({ verified: true });

      await put(aliasPath, 'late-target\n');
      const replay = await eraseLocalAccountStorage(inventory, {
        lease: durable.lease,
        projectRoot,
        staticRoot,
      });

      expect(replay.verified).toBe(false);
      expect(replay.classes.find(({ dataClass }) => dataClass === 'static_routing_aliases')).toMatchObject({
        remainingAfterPurge: 1,
      });
      await expect(exists(aliasPath)).resolves.toBe(true);
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
      'static:deployment-restore-target',
    ]);
    const validatedWriters = new Set<string>();
    let purgeBarrierActive = false;
    const tenantScope = { expectedOrganizationId: 'org-subject' };

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
    const coordinateProjectMutation: ProjectMutationCoordinator = (scope, effect) =>
      withProjectLock(scope.projectId, async () => {
        await validateWriter(scope.projectId);
        return effect();
      });

    vi.stubEnv('PROJECT_STORAGE_DIR', projectRoot);
    vi.stubEnv('STATIC_DEPLOY_STORAGE_DIR', staticRoot);
    vi.stubEnv('VIBECORE_PROJECT_LOCK', 'disabled');

    try {
      await put(join(outputDir, 'index.html'), '<main>stale writer</main>');
      await put(
        join(staticRoot, 'deployment-restore-source', 'index.html'),
        '<script src="/static-deployments/deployment-restore-source/assets.js"></script>',
      );
      const storage = new LocalProjectStorage(coordinateProjectMutation, coordinateProjectMutation);
      const writers = [
        storage.writeFiles('tree-project', [{ path: 'src/late.ts', content: 'late tree' }], tenantScope),
        storage.exportZip('archive-project', tenantScope),
        storage.createSnapshot({
          projectId: 'checkpoint-project',
          expectedOrganizationId: tenantScope.expectedOrganizationId,
          storageKey: 'snapshots/checkpoint-project/stale.zip',
          files: [{ path: 'secret.txt', content: 'late checkpoint', updatedAt: new Date().toISOString() }],
        }),
        storage.writeFiles('shared-project', [{ path: 'private.txt', content: 'late workspace' }], {
          ...tenantScope,
          workspaceId: 'ws-subject',
        }),
        snapshotStaticBuild('deployment-stale-writer', outputDir, () =>
          validateWriter('static:deployment-stale-writer'),
        ),
        restoreStaticSnapshotInto('deployment-restore-source', 'deployment-restore-target', () =>
          validateWriter('static:deployment-restore-target'),
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
          staticDeploymentIds: ['deployment-stale-writer', 'deployment-restore-target'],
          staticArtifactRefs: [],
          staticAliasDeploymentIds: ['deployment-stale-writer', 'deployment-restore-target'],
        },
        { lease: durableLease().lease, projectRoot, staticRoot },
      ).finally(() => {
        purgeSettled = true;
      });

      /* The first erasure is queued behind a writer that validated before the plan existed. */
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(purgeSettled).toBe(false);

      writerRelease.resolve();
      const writerResults = await Promise.allSettled(writers);
      expect(writerResults.slice(0, -1).every((result) => result.status === 'fulfilled')).toBe(true);
      expect(writerResults.at(-1)).toMatchObject({
        status: 'rejected',
        reason: { code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' },
      });
      await expect(purge).resolves.toMatchObject({ verified: true });

      await expect(exists(join(projectRoot, 'tree-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'exports', 'archive-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'snapshots', 'checkpoint-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, 'shared-project', '.vibecore-workspaces', 'ws-subject'))).resolves.toBe(
        false,
      );
      await expect(exists(join(staticRoot, 'deployment-stale-writer'))).resolves.toBe(false);
      await expect(exists(join(staticRoot, 'deployment-restore-target'))).resolves.toBe(false);

      await expect(
        storage.writeFiles('tree-project', [{ path: 'src/resurrected.ts', content: 'blocked' }], tenantScope),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(storage.exportZip('archive-project', tenantScope)).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });
      await expect(
        storage.createSnapshot({
          projectId: 'checkpoint-project',
          expectedOrganizationId: tenantScope.expectedOrganizationId,
          files: [{ path: 'resurrected.txt', content: 'blocked', updatedAt: new Date().toISOString() }],
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(
        storage.writeFiles('shared-project', [{ path: 'resurrected.txt', content: 'blocked' }], {
          ...tenantScope,
          workspaceId: 'ws-subject',
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(
        snapshotStaticBuild('deployment-stale-writer', outputDir, () =>
          validateWriter('static:deployment-stale-writer'),
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      await expect(
        restoreStaticSnapshotInto('deployment-restore-source', 'deployment-restore-target', () =>
          validateWriter('static:deployment-restore-target'),
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE' });
      /* Even Git read surfaces call ensureRepository(), so they share the writer fence. */
      await expect(
        new GitCliProvider(coordinateProjectMutation).logGraph('tree-project', tenantScope),
      ).rejects.toMatchObject({
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
      });

      await expect(exists(join(projectRoot, 'tree-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'exports', 'archive-project'))).resolves.toBe(false);
      await expect(exists(join(projectRoot, '_objects', 'snapshots', 'checkpoint-project'))).resolves.toBe(false);
      await expect(exists(join(staticRoot, 'deployment-stale-writer'))).resolves.toBe(false);
      await expect(exists(join(staticRoot, 'deployment-restore-target'))).resolves.toBe(false);
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
            staticArtifactRefs: [],
            staticAliasDeploymentIds: [],
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
