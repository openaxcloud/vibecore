/*
 * Seeding helper for the LIVE rollback proof.
 *
 * Writes the two prior releases exactly as a publish leaves them — real bytes under the
 * deployment's own snapshot directory, and a real ReleaseManifest row in Postgres — using
 * the SAME Prisma client and the SAME digest function the server uses. Nothing here is
 * mocked; it stands in only for the workspace-pod build, which needs a cluster.
 *
 * The rollback machinery under proof (selection, digest verification, restore, the
 * compare-and-set, the READY flip and the public serve path) is exercised live and
 * untouched by this file.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/*
 * Imported by path, not by package name: this worktree's root node_modules is a symlink
 * into the main checkout, so `@vibecore/database` would resolve to that checkout's copy
 * instead of this branch's.
 */
import { createDatabaseClient } from '../packages/database/src/index.ts';

const STATIC_ROOT = process.env.STATIC_DEPLOY_STORAGE_DIR;
const API = process.env.API_BASE ?? 'http://127.0.0.1:3199';

const prisma = createDatabaseClient();

/** Same layout the server's staticDeploymentSnapshotDir() produces. */
const snapshotDir = (deploymentId) => join(STATIC_ROOT, deploymentId);

export const liveUrlFor = (deploymentId) => `${API}/static-deployments/${deploymentId}/index.html`;

/**
 * The server's content digest for a static snapshot is a hash over the entry list
 * (path + sha256 of bytes). We reproduce it by asking the server itself: after seeding,
 * the rollback endpoint recomputes and verifies it, so a mismatch would surface there
 * rather than being papered over here.
 */
const sha256 = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

export async function seedRelease({ projectId, version, marker }) {
  const deploymentId = `dep_live_${version}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const content = `<!doctype html><html><body><h1>${marker}</h1></body></html>`;

  const dir = snapshotDir(deploymentId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), content, 'utf8');

  await prisma.deployment.create({
    data: {
      id: deploymentId,
      projectId,
      provider: 'static',
      environmentName: 'preview',
      status: 'READY',
      url: liveUrlFor(deploymentId),
      metadata: { rollbackable: true },
      logs: [],
    },
  });

  /*
   * The digest is computed by the SERVER'S OWN function, imported directly — not a
   * re-implementation. The rollback endpoint recomputes it and refuses on any mismatch,
   * so a wrong value here would fail the proof loudly rather than pass silently.
   */
  const { computeStaticSnapshotDigest } = await import('../services/api/src/deployments.ts');
  const digest = await computeStaticSnapshotDigest(deploymentId);

  await prisma.releaseManifest.create({
    data: {
      projectId,
      deploymentId,
      environment: 'preview',
      version,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-deployments/${deploymentId}`,
      artifactDigest: digest,
    },
  });

  return { version, deploymentId, content, digest, contentDigest: sha256(content) };
}
