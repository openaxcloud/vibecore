import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions, type WorkspacePodStaticBuild } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectReleaseBarrierLease, ProjectReleaseFence } from '../store.js';
import { DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS } from './deterministic-release-fixture.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

type FenceLatch = 'exact' | 'expired' | 'forged';

interface KnownReleaseFence {
  projectId: string;
  fence: ProjectReleaseFence;
}

interface DeploymentFenceAttempt {
  deploymentId: string;
  status?: string;
  phase: 'active' | 'released';
  exact: boolean;
  latched: boolean;
}

function sameReleaseFence(left: ProjectReleaseFence | undefined, right: ProjectReleaseFence): boolean {
  return (
    left?.checkpointId === right.checkpointId &&
    left.ownerToken === right.ownerToken &&
    left.fence === right.fence &&
    left.expectedOrganizationId === right.expectedOrganizationId &&
    left.expectedManifestDigest === right.expectedManifestDigest
  );
}

/**
 * Regression seam for the route layer: every Deployment mutation made while a
 * release barrier is active must carry the exact authority returned by that
 * barrier. The latch can invalidate that authority immediately before the
 * store mutation, reproducing the guard.assert() -> write TOCTOU window.
 */
class DeploymentReleaseFenceLatchStore extends TestApiStore {
  readonly attempts: DeploymentFenceAttempt[] = [];
  fencedRejections = 0;
  latch: FenceLatch = 'exact';

  private latched = false;
  private readonly activeFences = new Map<string, KnownReleaseFence>();
  private readonly knownFences = new Map<string, KnownReleaseFence>();

  override async acquireProjectReleaseBarrier(
    input: Parameters<TestApiStore['acquireProjectReleaseBarrier']>[0],
  ): Promise<ProjectReleaseBarrierLease | undefined> {
    const lease = await super.acquireProjectReleaseBarrier(input);

    if (lease) {
      const known = {
        projectId: input.projectId,
        fence: {
          checkpointId: lease.checkpointId,
          ownerToken: lease.ownerToken,
          fence: lease.fence,
          expectedOrganizationId: input.expectedOrganizationId,
          expectedManifestDigest: input.expectedManifestDigest,
        },
      };
      this.activeFences.set(input.projectId, known);
      this.knownFences.set(lease.checkpointId, known);
    }

    return lease;
  }

  override async releaseProjectReleaseBarrier(
    input: Parameters<TestApiStore['releaseProjectReleaseBarrier']>[0],
  ): Promise<boolean> {
    const released = await super.releaseProjectReleaseBarrier(input);
    const active = this.activeFences.get(input.projectId);

    if (active?.fence.checkpointId === input.checkpointId) {
      this.activeFences.delete(input.projectId);
    }

    return released;
  }

  override async updateDeployment(
    projectId: string,
    deploymentId: string,
    patch: Parameters<TestApiStore['updateDeployment']>[2],
    releaseFence?: ProjectReleaseFence,
  ) {
    const active = this.activeFences.get(projectId);
    const known = active ?? (releaseFence ? this.knownFences.get(releaseFence.checkpointId) : undefined);
    const shouldLatch = Boolean(active && !this.latched && this.latch !== 'exact');

    if (active || releaseFence) {
      this.attempts.push({
        deploymentId,
        status: patch.status,
        phase: active ? 'active' : 'released',
        exact: Boolean(known && sameReleaseFence(releaseFence, known.fence)),
        latched: shouldLatch,
      });
    }

    let effectiveFence = releaseFence;

    if (shouldLatch && active) {
      this.latched = true;

      if (this.latch === 'expired') {
        const barrier = this.projectCheckpoints.get(active.fence.checkpointId);
        if (!barrier) throw new Error('TEST_RELEASE_BARRIER_MISSING');
        barrier.barrierExpiresAt = new Date(Date.now() - 1_000).toISOString();
      } else {
        effectiveFence = releaseFence ? { ...releaseFence, ownerToken: 'forged-release-owner' } : undefined;
      }
    }

    try {
      return await super.updateDeployment(projectId, deploymentId, patch, effectiveFence);
    } catch (error) {
      if (releaseFence) this.fencedRejections += 1;
      throw error;
    }
  }
}

class StaticManifestFailureFenceStore extends DeploymentReleaseFenceLatchStore {
  override async createReleaseManifest(input: Parameters<TestApiStore['createReleaseManifest']>[0]) {
    if (input.artifactKind === 'static-snapshot') {
      throw Object.assign(new Error('injected static release-manifest failure'), {
        code: 'STATIC_MANIFEST_APPEND_INJECTED_FAILURE',
      });
    }

    return super.createReleaseManifest(input);
  }
}

const SAVED_ENV = {
  INTERNAL_API_SHARED_SECRET: process.env.INTERNAL_API_SHARED_SECRET,
  STATIC_DEPLOY_STORAGE_DIR: process.env.STATIC_DEPLOY_STORAGE_DIR,
  NETLIFY_BUILD_HOOK_URL: process.env.NETLIFY_BUILD_HOOK_URL,
  SERVER_DEPLOY_USE_PROBE: process.env.SERVER_DEPLOY_USE_PROBE,
  SERVER_DEPLOY_SNAPSHOT_IMAGE: process.env.SERVER_DEPLOY_SNAPSHOT_IMAGE,
  WORKSPACE_MANAGER_URL: process.env.WORKSPACE_MANAGER_URL,
};

describe('deployment route release-fence propagation', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'vibecore-deployment-release-fence-'));
    process.env.INTERNAL_API_SHARED_SECRET = 'deployment-release-fence-internal-secret';
    process.env.STATIC_DEPLOY_STORAGE_DIR = join(tempRoot, 'published');
    delete process.env.NETLIFY_BUILD_HOOK_URL;
    delete process.env.SERVER_DEPLOY_USE_PROBE;
    delete process.env.SERVER_DEPLOY_SNAPSHOT_IMAGE;
    delete process.env.WORKSPACE_MANAGER_URL;
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(SAVED_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(tempRoot, { recursive: true, force: true });
  });

  const buildTestApiApp = (options: ApiAppOptions) =>
    buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });

  async function seedQueuedDeployment(store: DeploymentReleaseFenceLatchStore, provider = 'static') {
    const owner = await store.createUser({
      email: `release-fence-${provider}-${Date.now()}@example.test`,
      passwordHash: 'test-only-password-hash',
    });
    const organization = await store.createOrganization({
      name: `Release fence ${provider}`,
      slug: `release-fence-${provider}-${Date.now()}`,
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: `Release fence ${provider}`,
      slug: `release-fence-project-${provider}-${Date.now()}`,
    });
    await store.upsertSubscription({ organizationId: organization.id, planKey: 'pro', status: 'ACTIVE' });
    const manifest = await store.getLatestProjectManifest(project.id);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const deployment = await store.createDeployment({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      provider,
      environment: 'preview',
      status: 'QUEUED',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      metadata: {
        planEntitlements: { ...DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS, publishRegion: 'global' },
        projectManifestDigest: manifest.digest,
      },
    });

    return { owner, organization, project, manifest, deployment };
  }

  async function driveInternalBuild(
    app: Awaited<ReturnType<typeof buildTestApiApp>>,
    input: Awaited<ReturnType<typeof seedQueuedDeployment>>,
  ) {
    return app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer deployment-release-fence-internal-secret' },
      payload: {
        projectId: input.project.id,
        deploymentId: input.deployment.id,
        userId: input.owner.id,
        buildInput: {
          provider: input.deployment.provider,
          environment: 'preview',
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
        },
      },
    });
  }

  async function successfulStaticBuild() {
    const root = await mkdtemp(join(tempRoot, 'build-'));
    const outputDir = join(root, 'dist');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'index.html'), '<!doctype html><h1>fenced</h1>', 'utf8');
    return { ok: true as const, outputDir, logs: [] };
  }

  it('passes the exact fence into the publish final mutation', async () => {
    const store = new DeploymentReleaseFenceLatchStore();
    const seeded = await seedQueuedDeployment(store);
    const app = await buildTestApiApp({ store, staticBuildRunner: successfulStaticBuild });

    try {
      const response = await driveInternalBuild(app, seeded);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().deployment.status).toBe('READY');
      const activeAttempts = store.attempts.filter((attempt) => attempt.phase === 'active');
      expect(activeAttempts.length).toBeGreaterThan(0);
      expect(activeAttempts.every((attempt) => attempt.exact)).toBe(true);
      expect(store.fencedRejections).toBe(0);
    } finally {
      await app.close();
    }
  });

  it.each(['expired', 'forged'] as const)(
    'rejects an %s fence atomically on the provider-failure mutation',
    async (latch) => {
      const store = new DeploymentReleaseFenceLatchStore();
      store.latch = latch;
      const seeded = await seedQueuedDeployment(store);
      const app = await buildTestApiApp({
        store,
        staticBuildRunner: async () => ({
          ok: false as const,
          error: 'INJECTED_PROVIDER_FAILURE',
          logs: [{ timestamp: new Date().toISOString(), level: 'error' as const, message: 'provider failed' }],
        }),
      });

      try {
        const response = await driveInternalBuild(app, seeded);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().deployment.status).toBe('FAILED');
        expect(
          store.attempts.some(
            (attempt) => attempt.phase === 'active' && attempt.latched && attempt.exact && attempt.status === 'FAILED',
          ),
        ).toBe(true);
        expect(store.fencedRejections).toBeGreaterThan(0);
        expect(await store.listReleaseManifests(seeded.project.id, 'preview')).toEqual([]);
        expect((await store.getDeployment(seeded.project.id, seeded.deployment.id))?.url).toBeFalsy();
      } finally {
        await app.close();
      }
    },
  );

  it('keeps the static manifest failure mutation behind the same exact fence', async () => {
    const store = new StaticManifestFailureFenceStore();
    const seeded = await seedQueuedDeployment(store);
    const app = await buildTestApiApp({ store, staticBuildRunner: successfulStaticBuild });

    try {
      const response = await driveInternalBuild(app, seeded);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().deployment.status).toBe('FAILED');
      expect(
        store.attempts
          .filter((attempt) => attempt.phase === 'active')
          .map((attempt) => ({
            status: attempt.status,
            exact: attempt.exact,
          })),
      ).toEqual([
        { status: 'BUILDING', exact: true },
        { status: 'FAILED', exact: true },
      ]);
      expect(await store.listReleaseManifests(seeded.project.id, 'preview')).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('rejects a forged fence before a server runtime result can mutate the row', async () => {
    process.env.SERVER_DEPLOY_USE_PROBE = 'true';
    process.env.WORKSPACE_MANAGER_URL = 'https://workspace-manager.release-fence.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.endsWith('/server-deployments/start')) {
          return new Response(
            JSON.stringify({
              ready: true,
              url: 'https://server.release-fence.test',
              name: 'server-release-fence',
              readyReplicas: 1,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/server-deployments/') && url.endsWith('/stop')) {
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const store = new DeploymentReleaseFenceLatchStore();
    store.latch = 'forged';
    const seeded = await seedQueuedDeployment(store, 'server');
    const app = await buildTestApiApp({ store });

    try {
      const response = await driveInternalBuild(app, seeded);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().deployment.status).toBe('FAILED');
      expect(
        store.attempts.some(
          (attempt) => attempt.phase === 'active' && attempt.latched && attempt.exact && attempt.status === 'BUILDING',
        ),
      ).toBe(true);
      expect(store.fencedRejections).toBeGreaterThan(0);
      const persisted = await store.getDeployment(seeded.project.id, seeded.deployment.id);
      expect(persisted?.url).toBeFalsy();
      expect((persisted?.metadata as Record<string, unknown> | undefined)?.serverDeploy).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('rejects a redeploy final mutation when its exact fence expires at the write latch', async () => {
    process.env.NETLIFY_BUILD_HOOK_URL = 'https://netlify.release-fence.test/hook';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('provider failed', { status: 502 })),
    );
    const store = new DeploymentReleaseFenceLatchStore();
    const app = await buildTestApiApp({ store });
    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'redeploy-release-fence@example.test',
        password: 'password123',
        name: 'Redeploy release fence',
        organizationName: 'Redeploy release fence',
      },
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const auth = registration.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'Redeploy release fence project' },
    });
    expect(projectResponse.statusCode, projectResponse.body).toBe(201);
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;
    const manifest = await store.getLatestProjectManifest(projectId);
    if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');
    const source = await store.createDeployment({
      projectId,
      expectedOrganizationId: auth.organization.id,
      provider: 'netlify',
      environment: 'preview',
      status: 'READY',
      url: 'https://source.release-fence.test',
      previewUrl: 'https://source.release-fence.test',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      metadata: {
        planEntitlements: { ...DETERMINISTIC_RELEASE_PLAN_ENTITLEMENTS, publishRegion: 'global' },
        projectManifestDigest: manifest.digest,
      },
    });
    store.latch = 'expired';

    try {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${source.id}/redeploy`,
        headers: { authorization: `Bearer ${auth.token}` },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      expect(
        store.attempts.some(
          (attempt) => attempt.phase === 'active' && attempt.latched && attempt.exact && attempt.status === 'FAILED',
        ),
      ).toBe(true);
      expect(store.fencedRejections).toBeGreaterThan(0);
      const redeploys = (await store.listDeployments(projectId)).filter((deployment) => deployment.id !== source.id);
      expect(redeploys).toHaveLength(1);
      expect(redeploys[0]?.status).toBe('FAILED');
      expect(redeploys[0]?.url).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('passes a released fence into a detached heartbeat so the late mutation is rejected', async () => {
    const store = new DeploymentReleaseFenceLatchStore();
    const seeded = await seedQueuedDeployment(store);
    const podBuild: WorkspacePodStaticBuild = async (_request, _project, _body, _deploymentId, progress) => {
      const result = await successfulStaticBuild();
      progress?.onPhase?.('building');
      progress?.onLog?.({ timestamp: new Date().toISOString(), level: 'info', message: 'heartbeat' });
      return { handled: true, result, tempDir: result.outputDir };
    };
    const app = await buildTestApiApp({
      store,
      useWorkspacePodBuild: true,
      buildStaticInWorkspacePod: podBuild,
      staticBuildRunner: async () => ({ ok: false as const, error: 'MUST_NOT_RUN', logs: [] }),
    });

    try {
      const response = await driveInternalBuild(app, seeded);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().deployment.status).toBe('READY');
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(store.attempts.some((attempt) => attempt.phase === 'released' && attempt.exact && !attempt.latched)).toBe(
        true,
      );
      expect(store.fencedRejections).toBeGreaterThan(0);
      expect((await store.getDeployment(seeded.project.id, seeded.deployment.id))?.status).toBe('READY');
    } finally {
      await app.close();
    }
  });
});
