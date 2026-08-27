import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  computeStaticArtifactDigest,
  computeStaticSnapshotDigest,
  garbageCollectStaticArtifacts,
  removeStaticDeploymentSnapshot,
  restoreStaticArtifactInto,
  retainStaticSnapshotArtifact,
  snapshotStaticBuild,
  staticDeploymentArtifactDir,
  withRetainedStaticSnapshotArtifact,
} from './deployments.js';

describe('content-addressed static release retention', () => {
  const previousRoot = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const previousPreviewDomain = process.env.PREVIEW_DOMAIN;
  const roots: string[] = [];

  afterEach(async () => {
    if (previousRoot === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = previousRoot;
    if (previousPreviewDomain === undefined) delete process.env.PREVIEW_DOMAIN;
    else process.env.PREVIEW_DOMAIN = previousPreviewDomain;

    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'vibecore-static-artifact-'));
    roots.push(root);
    process.env.STATIC_DEPLOY_STORAGE_DIR = join(root, 'storage');
    delete process.env.PREVIEW_DOMAIN;
    const build = join(root, 'build');
    await mkdir(join(build, 'assets'), { recursive: true });
    await writeFile(
      join(build, 'index.html'),
      '<script src="/static-deployments/source-deployment/assets/app.js"></script>',
    );
    await writeFile(join(build, 'assets', 'app.js'), 'console.log("immutable");');
    await snapshotStaticBuild('source-deployment', build);
    const digest = (await computeStaticSnapshotDigest('source-deployment'))!;
    const artifactRef = await retainStaticSnapshotArtifact('source-deployment', digest);
    return { digest, artifactRef };
  }

  it('restores exact bytes after the source deployment snapshot is pruned', async () => {
    const { digest, artifactRef } = await fixture();
    await removeStaticDeploymentSnapshot('source-deployment');

    expect(await computeStaticSnapshotDigest('source-deployment')).toBeUndefined();
    expect(await computeStaticArtifactDigest(artifactRef)).toBe(digest);

    await restoreStaticArtifactInto(artifactRef, digest, 'rollback-deployment');
    expect(await computeStaticSnapshotDigest('rollback-deployment')).toBe(digest);
    expect(
      await readFile(join(process.env.STATIC_DEPLOY_STORAGE_DIR!, 'rollback-deployment', 'index.html'), 'utf8'),
    ).toContain('/static-deployments/source-deployment/assets/app.js');
  });

  it('refuses missing and tampered retained content before materialising a destination', async () => {
    const { digest, artifactRef } = await fixture();
    await writeFile(join(staticDeploymentArtifactDir(artifactRef), 'assets', 'app.js'), 'tampered');

    await expect(restoreStaticArtifactInto(artifactRef, digest, 'rollback-deployment')).rejects.toMatchObject({
      code: 'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
      statusCode: 409,
    });
    expect(await computeStaticSnapshotDigest('rollback-deployment')).toBeUndefined();
  });

  it('keeps ReleaseManifest-referenced content and collects only unreferenced artifacts', async () => {
    const retained = await fixture();
    const secondBuild = join(roots[0]!, 'build-two');
    await mkdir(secondBuild, { recursive: true });
    await writeFile(join(secondBuild, 'index.html'), '<h1>unreferenced</h1>');
    await snapshotStaticBuild('unreferenced-deployment', secondBuild);
    const secondDigest = (await computeStaticSnapshotDigest('unreferenced-deployment'))!;
    const unreferenced = await retainStaticSnapshotArtifact('unreferenced-deployment', secondDigest);

    const result = await garbageCollectStaticArtifacts(async (artifactRef) => artifactRef === retained.artifactRef);

    expect(result.retained).toEqual([retained.artifactRef]);
    expect(result.removed).toEqual([unreferenced]);
    expect(await computeStaticArtifactDigest(retained.artifactRef)).toBe(retained.digest);
    expect(await computeStaticArtifactDigest(unreferenced)).toBeUndefined();
  });

  it('serializes GC behind the manifest append latch for a newly retained artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibecore-static-publish-race-'));
    roots.push(root);
    process.env.STATIC_DEPLOY_STORAGE_DIR = join(root, 'storage');
    delete process.env.PREVIEW_DOMAIN;
    const build = join(root, 'build');
    await mkdir(build, { recursive: true });
    await writeFile(join(build, 'index.html'), '<h1>atomic</h1>');
    await snapshotStaticBuild('publishing-deployment', build);
    const digest = (await computeStaticSnapshotDigest('publishing-deployment'))!;
    let releaseManifestCommitted = false;
    let retentionChecks = 0;
    let enterCommit!: () => void;
    let releaseCommit!: () => void;
    const commitEntered = new Promise<void>((resolve) => {
      enterCommit = resolve;
    });
    const commitLatch = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });

    const publishing = withRetainedStaticSnapshotArtifact('publishing-deployment', digest, async (artifactRef) => {
      enterCommit();
      await commitLatch;
      releaseManifestCommitted = true;
      return artifactRef;
    });
    await commitEntered;
    const collecting = garbageCollectStaticArtifacts(async () => {
      retentionChecks += 1;
      return releaseManifestCommitted;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(retentionChecks).toBe(0);
    releaseCommit();
    const [artifactRef, gc] = await Promise.all([publishing, collecting]);

    expect(gc.removed).toEqual([]);
    expect(gc.retained).toEqual([artifactRef]);
    expect(await computeStaticArtifactDigest(artifactRef)).toBe(digest);
  });
});
