import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import {
  LocalProjectStorage,
  type ProjectStaticArtifactAuthority,
  type ProjectStaticErasureAuthority,
} from '../project-storage.js';

const execFile = promisify(execFileCallback);
const roots: string[] = [];
const previousStaticRoot = process.env.STATIC_DEPLOY_STORAGE_DIR;

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function put(target: string, content: string): Promise<void> {
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content, 'utf8');
}

function digest(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function artifactRef(value: string): string {
  return `static-artifacts/sha256/${value}`;
}

function authority(
  projectId: string,
  deploymentIds: readonly string[],
  artifacts: readonly ProjectStaticArtifactAuthority[],
): ProjectStaticErasureAuthority {
  return {
    async resolveInventory(requestedProjectId) {
      return {
        projectId: requestedProjectId === projectId ? projectId : 'wrong-project',
        deploymentIds: [...deploymentIds],
        artifacts: artifacts.map((artifact) => ({ ...artifact })),
      };
    },
    async resolveArtifact(requestedProjectId, requestedArtifactRef) {
      if (requestedProjectId !== projectId) return undefined;
      const artifact = artifacts.find((candidate) => candidate.artifactRef === requestedArtifactRef);
      return artifact ? { ...artifact } : undefined;
    },
  };
}

afterEach(async () => {
  await Promise.allSettled(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  if (previousStaticRoot === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
  else process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticRoot;
});

describe('LocalProjectStorage static permanent erasure', () => {
  it('erases exhaustive snapshots, aliases, recovery paths and unshared artifacts without following special entries', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-project-static-erasure-'));
    roots.push(base);
    const staticRoot = join(base, 'static');
    process.env.STATIC_DEPLOY_STORAGE_DIR = staticRoot;
    await mkdir(staticRoot, { recursive: true });

    const projectId = 'project-subject';
    const regularDeploymentIds = Array.from({ length: 275 }, (_, index) => `subject-deployment-${index}`);
    const symlinkDeploymentId = 'subject-symlink-snapshot';
    const fifoDeploymentId = 'subject-fifo-snapshot';
    const deploymentIds = [...regularDeploymentIds, symlinkDeploymentId, fifoDeploymentId];
    const neighborDeploymentId = 'neighbor-deployment';
    const outside = join(base, 'outside-neighbor');
    const outsideSecret = join(outside, 'secret.txt');
    await put(outsideSecret, 'neighbor bytes must survive');

    await Promise.all(
      regularDeploymentIds.map(async (deploymentId, index) => {
        const root = join(staticRoot, deploymentId);
        await put(join(root, 'assets', 'index.js'), `subject bytes ${index}`);
      }),
    );
    await symlink(outside, join(staticRoot, symlinkDeploymentId));
    await execFile('mkfifo', [join(staticRoot, fifoDeploymentId)]);
    await put(join(staticRoot, `${regularDeploymentIds[0]}.tmp-crashed-copy`, 'partial.bin'), 'partial snapshot');
    await put(join(staticRoot, neighborDeploymentId, 'index.html'), 'neighbor snapshot');

    const aliasRoot = join(staticRoot, '.aliases');
    await mkdir(aliasRoot, { recursive: true });
    await Promise.all(
      regularDeploymentIds.map((deploymentId) => writeFile(join(aliasRoot, deploymentId), `${neighborDeploymentId}\n`)),
    );
    await writeFile(join(aliasRoot, 'neighbor-incoming-alias'), `${regularDeploymentIds[0]}\n`);
    await writeFile(join(aliasRoot, `${regularDeploymentIds[0]}.tmp-crashed-alias`), `${neighborDeploymentId}\n`);
    await execFile('mkfifo', [join(aliasRoot, `${regularDeploymentIds[1]}.tmp-special-alias`)]);
    await writeFile(join(aliasRoot, 'neighbor-unrelated-alias'), `${neighborDeploymentId}\n`);

    const uniqueDigest = digest('project-subject-unique-artifact');
    const sharedDigest = digest('project-subject-shared-artifact');
    const artifactRoot = join(staticRoot, '.artifacts', 'sha256');
    const uniqueArtifact = join(artifactRoot, uniqueDigest);
    const sharedArtifact = join(artifactRoot, sharedDigest);
    await put(join(uniqueArtifact, 'assets', 'app.js'), 'unique content-addressed bytes');
    await symlink(outsideSecret, join(uniqueArtifact, 'external-link'));
    await execFile('mkfifo', [join(uniqueArtifact, 'special-entry')]);
    await put(join(artifactRoot, `${uniqueDigest}.tmp-crashed-retain`, 'partial.bin'), 'partial retained bytes');
    await put(join(sharedArtifact, 'assets', 'app.js'), 'shared content-addressed bytes');

    const artifacts: ProjectStaticArtifactAuthority[] = [
      { artifactRef: artifactRef(uniqueDigest), projectReferenceCount: 3, otherReferenceCount: 0 },
      { artifactRef: artifactRef(sharedDigest), projectReferenceCount: 1, otherReferenceCount: 2 },
    ];
    const storage = new LocalProjectStorage(
      undefined,
      undefined,
      undefined,
      authority(projectId, deploymentIds, artifacts),
    );

    const expectedArtifacts = [
      { digest: uniqueDigest, outcome: 'DELETED_UNREFERENCED' as const, otherReferenceCount: 0 },
      { digest: sharedDigest, outcome: 'RETAINED_BY_OTHER_MANIFEST' as const, otherReferenceCount: 2 },
    ].sort((left, right) => left.digest.localeCompare(right.digest));
    await expect(storage.prepareProjectStaticErasureWithinPhysicalAccess(projectId)).resolves.toEqual({
      summary: objectStorageStaticArtifactSummary(expectedArtifacts),
      artifacts: artifacts
        .map((artifact) => ({
          ...artifact,
          digest: artifact.artifactRef.slice('static-artifacts/sha256/'.length),
        }))
        .sort((left, right) => left.artifactRef.localeCompare(right.artifactRef)),
    });

    await storage.eraseProjectStaticDataWithinPhysicalAccess(projectId);

    await expect(
      Promise.all(deploymentIds.map((deploymentId) => exists(join(staticRoot, deploymentId)))),
    ).resolves.toEqual(deploymentIds.map(() => false));
    await expect(exists(join(staticRoot, `${regularDeploymentIds[0]}.tmp-crashed-copy`))).resolves.toBe(false);
    await expect(exists(join(aliasRoot, 'neighbor-incoming-alias'))).resolves.toBe(false);
    await expect(exists(join(aliasRoot, `${regularDeploymentIds[0]}.tmp-crashed-alias`))).resolves.toBe(false);
    await expect(exists(join(aliasRoot, `${regularDeploymentIds[1]}.tmp-special-alias`))).resolves.toBe(false);
    await expect(exists(uniqueArtifact)).resolves.toBe(false);
    await expect(exists(join(artifactRoot, `${uniqueDigest}.tmp-crashed-retain`))).resolves.toBe(false);

    await expect(readFile(outsideSecret, 'utf8')).resolves.toBe('neighbor bytes must survive');
    await expect(readFile(join(staticRoot, neighborDeploymentId, 'index.html'), 'utf8')).resolves.toBe(
      'neighbor snapshot',
    );
    await expect(readFile(join(aliasRoot, 'neighbor-unrelated-alias'), 'utf8')).resolves.toBe(
      `${neighborDeploymentId}\n`,
    );
    await expect(readFile(join(sharedArtifact, 'assets', 'app.js'), 'utf8')).resolves.toBe(
      'shared content-addressed bytes',
    );

    const proof = await storage.verifyProjectDataAbsentWithinPhysicalAccess(projectId);
    expect(proof).toMatchObject({
      staticSnapshotsAbsent: true,
      staticAliasesAbsent: true,
      staticArtifactSummary: objectStorageStaticArtifactSummary(expectedArtifacts),
    });

    await expect(storage.eraseProjectStaticDataWithinPhysicalAccess(projectId)).resolves.toBeUndefined();
    await expect(storage.verifyProjectDataAbsentWithinPhysicalAccess(projectId)).resolves.toEqual(proof);
  });

  it('fails closed without an injected database authority and preserves bytes', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-project-static-no-authority-'));
    roots.push(base);
    const staticRoot = join(base, 'static');
    process.env.STATIC_DEPLOY_STORAGE_DIR = staticRoot;
    const snapshot = join(staticRoot, 'subject-deployment', 'index.html');
    await put(snapshot, 'must remain');

    const storage = new LocalProjectStorage();
    await expect(storage.eraseProjectStaticDataWithinPhysicalAccess('project-subject')).rejects.toMatchObject({
      code: 'PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE',
    });
    await expect(readFile(snapshot, 'utf8')).resolves.toBe('must remain');
  });

  it('refuses a symlinked static namespace without touching its external target', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vibecore-project-static-unsafe-'));
    roots.push(base);
    const staticRoot = join(base, 'static');
    const outsideAliases = join(base, 'outside-aliases');
    process.env.STATIC_DEPLOY_STORAGE_DIR = staticRoot;
    await mkdir(staticRoot, { recursive: true });
    await put(join(outsideAliases, 'subject-deployment'), 'subject-deployment\n');
    await symlink(outsideAliases, join(staticRoot, '.aliases'));

    const storage = new LocalProjectStorage(
      undefined,
      undefined,
      undefined,
      authority('project-subject', ['subject-deployment'], []),
    );
    await expect(storage.prepareProjectStaticErasureWithinPhysicalAccess('project-subject')).rejects.toMatchObject({
      code: 'PROJECT_STATIC_ERASURE_UNSAFE_NAMESPACE',
    });
    await expect(storage.eraseProjectStaticDataWithinPhysicalAccess('project-subject')).rejects.toMatchObject({
      code: 'PROJECT_STATIC_ERASURE_UNSAFE_NAMESPACE',
    });
    await expect(readFile(join(outsideAliases, 'subject-deployment'), 'utf8')).resolves.toBe('subject-deployment\n');
  });
});
