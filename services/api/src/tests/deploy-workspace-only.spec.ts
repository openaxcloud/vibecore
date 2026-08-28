import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions, type WorkspacePodStaticBuild } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

/*
 * #26 sub-part 2 — the deploy build runs ONLY in the workspace pod. When the pod
 * is unreachable the deploy fails cleanly; the in-api-pod build fallback (which
 * OOM'd the api pod) is gone. These tests force useWorkspacePodBuild=true (the
 * production shape) while ALSO injecting a staticBuildRunner spy, so we can PROVE
 * the in-api build is never invoked on the deploy path.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

describe('deploy builds only in the workspace pod (no api-pod fallback)', () => {
  const previousStaticRoot = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
  let tempStaticRoot: string;

  beforeEach(async () => {
    tempStaticRoot = await mkdtemp(join(tmpdir(), 'vc-workspace-only-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = tempStaticRoot;
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret-test';
  });

  afterEach(async () => {
    if (previousStaticRoot === undefined) {
      delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    } else {
      process.env.STATIC_DEPLOY_STORAGE_DIR = previousStaticRoot;
    }

    if (previousSecret === undefined) {
      delete process.env.INTERNAL_API_SHARED_SECRET;
    } else {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
    }

    vi.restoreAllMocks();
    await rm(tempStaticRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  async function setup(options: ApiAppOptions) {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store, useWorkspacePodBuild: true, ...options });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'workspace-only@example.com',
        password: 'password123',
        name: 'WS Only',
        organizationName: 'WS Only Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const auth = register.json() as { token: string; organization: { id: string }; user: { id: string } };

    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'WS Only Project' },
    });
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId, organizationId: auth.organization.id };
  }

  async function driveBuild(app: any, projectId: string, deploymentId: string, userId: string) {
    return app.inject({
      method: 'POST',
      url: '/internal/deployments/build',
      headers: { authorization: 'Bearer internal-secret-test' },
      payload: {
        projectId,
        deploymentId,
        userId,
        buildInput: { provider: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
      },
    });
  }

  it('FAILS cleanly when the workspace pod is unreachable — never builds in the api pod', async () => {
    // The in-api build spy: if this is ever called the fallback is back.
    const inApiBuildSpy = vi.fn(async () => ({ ok: true as const, outputDir: undefined, logs: [] }));

    // Workspace-pod seam reports the pod could not be reached (post provision + poll).
    const podBuild: WorkspacePodStaticBuild = vi.fn(async () => ({ handled: false as const }));

    const { app, store, auth, projectId, organizationId } = await setup({
      staticBuildRunner: inApiBuildSpy,
      buildStaticInWorkspacePod: podBuild,
    });

    const queued = await store.createDeployment({
      projectId,
      expectedOrganizationId: organizationId,
      provider: 'static',
      status: 'QUEUED',
    });
    const built = await driveBuild(app, projectId, queued.id, auth.user.id);

    expect(built.statusCode).toBe(200);
    expect(built.json().deployment.status).toBe('FAILED');
    expect(JSON.stringify(built.json().deployment.logs)).toContain('Workspace is starting — please retry');

    // The pod build was attempted; the in-api build was NEVER called.
    expect(podBuild).toHaveBeenCalledTimes(1);
    expect(inApiBuildSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it('builds in the workspace pod and marks READY — the api-pod build is never called', async () => {
    const inApiBuildSpy = vi.fn(async () => ({ ok: true as const, outputDir: undefined, logs: [] }));

    // Workspace-pod seam materializes a real artifact (as the real adapter would).
    const podBuild: WorkspacePodStaticBuild = vi.fn(async (_req, _project, _body, _deploymentId, progress) => {
      const root = await mkdtemp(join(tmpdir(), 'vc-pod-artifact-'));
      const outputDir = join(root, 'dist');
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'index.html'), '<!doctype html><h1>Pod build</h1>', 'utf8');
      progress?.onPhase?.('building');
      progress?.onLog?.({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Workspace deploy: built in pod',
      });

      return {
        handled: true as const,
        tempDir: outputDir,
        result: {
          ok: true as const,
          outputDir,
          logs: [{ timestamp: new Date().toISOString(), level: 'info' as const, message: 'Workspace deploy: OK' }],
        },
      };
    });

    const { app, store, auth, projectId, organizationId } = await setup({
      staticBuildRunner: inApiBuildSpy,
      buildStaticInWorkspacePod: podBuild,
    });

    const queued = await store.createDeployment({
      projectId,
      expectedOrganizationId: organizationId,
      provider: 'static',
      status: 'QUEUED',
    });
    const built = await driveBuild(app, projectId, queued.id, auth.user.id);

    expect(built.statusCode).toBe(200);
    expect(built.json().deployment.status).toBe('READY');
    expect(built.json().deployment.url).toContain(`/static-deployments/${queued.id}/`);

    expect(podBuild).toHaveBeenCalledTimes(1);
    expect(inApiBuildSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it('redeploy also fails closed when the pod is unreachable and never invokes the api-pod runner', async () => {
    const inApiBuildSpy = vi.fn(async () => ({ ok: true as const, outputDir: undefined, logs: [] }));
    const podBuild: WorkspacePodStaticBuild = vi.fn(async () => ({ handled: false as const }));
    const { app, store, auth, projectId, organizationId } = await setup({
      staticBuildRunner: inApiBuildSpy,
      buildStaticInWorkspacePod: podBuild,
    });
    const source = await store.createDeployment({
      projectId,
      expectedOrganizationId: organizationId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${source.id}/redeploy`,
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().deployment.status).toBe('FAILED');
    expect(JSON.stringify(response.json().deployment.logs)).toContain('Workspace is starting — please retry');
    expect(podBuild).toHaveBeenCalledTimes(1);
    expect(inApiBuildSpy).not.toHaveBeenCalled();

    await app.close();
  });
});
