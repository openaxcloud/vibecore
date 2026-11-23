import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API-local modules do not use the web app's ~/ alias.
import { buildApiApp, type ApiAppOptions, type WorkspacePodStaticBuild } from '../app.js';
// eslint-disable-next-line no-restricted-imports -- API-local modules do not use the web app's ~/ alias.
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * #26 sub-part 2 — the deploy build runs ONLY in the workspace pod. When the pod
 * is unreachable the deploy fails cleanly; the in-api-pod build fallback (which
 * OOM'd the api pod) is gone. These tests force useWorkspacePodBuild=true (the
 * production shape) while ALSO injecting a staticBuildRunner spy, so we can PROVE
 * the in-api build is never invoked on the deploy path.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {
    return undefined;
  }
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

    return { app, store, auth, projectId };
  }

  it('static redeploy fails closed without API builder after pod refusal', async () => {
    const inApiBuildSpy = vi.fn(async () => ({ ok: false as const, logs: [] }));
    const podBuild = vi.fn<WorkspacePodStaticBuild>(async () => ({ handled: false, refusal: 'WORKSPACE_UNREACHABLE' }));

    const { app, store, auth, projectId } = await setup({
      staticBuildRunner: inApiBuildSpy,
      buildStaticInWorkspacePod: podBuild,
    });

    try {
      await store.createWorkspace({ id: 'proof-target', projectId, name: 'Proof', runtimeMode: 'remote' });

      const source = await store.createDeployment({
        projectId,
        workspaceId: 'proof-target',
        provider: 'static',
        status: 'READY',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
      });
      const result = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${source.id}/redeploy`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {},
      });
      expect(result.statusCode).toBe(201);
      expect(podBuild).toHaveBeenCalledTimes(1);
      expect(inApiBuildSpy).not.toHaveBeenCalled();
      expect(result.json().deployment.status).toBe('FAILED');
    } finally {
      await app.close();
    }
  });
});
