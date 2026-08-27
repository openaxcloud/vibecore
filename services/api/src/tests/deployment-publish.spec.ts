import { hashPassword } from '@vibecore/auth';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { PromotionResult } from '../artifact-promotion.js';
import { buildPublishedDeploymentInput, canPublishDeployment } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import type { DeploymentRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

const READY_PREVIEW = {
  id: 'dep_src',
  projectId: 'proj_1',
  provider: 'static',
  environment: 'preview',
  status: 'READY',
  url: 'https://preview-app.example/',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  branch: 'main',
  commitSha: 'abc123',
  logs: [],
} as unknown as DeploymentRecord;

describe('canPublishDeployment', () => {
  it('allows a READY non-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'preview' })).toEqual({ ok: true });
  });

  it('rejects a not-yet-built deployment', () => {
    expect(canPublishDeployment({ status: 'BUILDING', environment: 'preview' })).toMatchObject({
      ok: false,
      code: 'NOT_READY',
    });
  });

  it('rejects an already-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'production' })).toMatchObject({
      ok: false,
      code: 'ALREADY_PRODUCTION',
    });
  });
});

describe('buildPublishedDeploymentInput', () => {
  it('clones the build config into a production deployment linked to its source', () => {
    const input = buildPublishedDeploymentInput(READY_PREVIEW, 'https://prod-app.example/');

    expect(input).toMatchObject({
      projectId: 'proj_1',
      provider: 'static',
      environment: 'production',
      status: 'READY',
      url: 'https://preview-app.example/', // same built artifact
      productionUrl: 'https://prod-app.example/',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      branch: 'main',
      commitSha: 'abc123',
      parentDeploymentId: 'dep_src',
    });
    expect(input.metadata).toMatchObject({ publishedFrom: 'dep_src' });
  });
});

async function setup(options: ApiAppOptions = {}) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider(), ...options });

  const user = await store.createUser({
    email: 'pub@example.com',
    name: 'Pub User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Pub Org', slug: 'pub-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pub-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Pub Project', slug: 'pub-project' });
  const manifest = await store.getLatestProjectManifest(project.id);

  if (!manifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

  return { app, store, token: 'pub-token', project, projectManifestDigest: manifest.digest };
}

describe('POST /projects/:id/deployments/:id/publish', () => {
  it('promotes a READY preview deployment to a linked production deployment', async () => {
    const { app, store, token, project } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.example/',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    const deployment = res.json().deployment;
    expect(deployment).toMatchObject({
      environment: 'production',
      status: 'READY',
      parentDeploymentId: source.id,
      url: 'https://preview.example/',
    });
  });

  it('rejects publishing a deployment that is not READY (409)', async () => {
    const { app, store, token, project } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'BUILDING',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NOT_READY');
  });

  it('404s for an unknown deployment', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/dep_missing/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('provisions a production DatabaseInstance on publish when DB provisioning is enabled (P2d split)', async () => {
    const original = process.env.DB_ROLLBACK_ENABLED;
    process.env.DB_ROLLBACK_ENABLED = 'true';

    try {
      const { app, store, token, project } = await setup();
      const source = await store.createDeployment({
        projectId: project.id,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: 'https://preview.example/',
      });

      // no production DB before publish
      expect(await store.getDatabaseInstanceByProject(project.id, 'production')).toBeUndefined();

      const res = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(201);

      // a distinct production instance now exists; the development one does not
      const prod = await store.getDatabaseInstanceByProject(project.id, 'production');
      expect(prod?.environment).toBe('production');
      expect(await store.getDatabaseInstanceByProject(project.id, 'development')).toBeUndefined();
    } finally {
      if (original === undefined) {
        delete (process.env as Record<string, string | undefined>).DB_ROLLBACK_ENABLED;
      } else {
        process.env.DB_ROLLBACK_ENABLED = original;
      }
    }
  });

  it('promotes a server image before manager start, then atomically commits READY + ReleaseManifest', async () => {
    const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
    const realFetch = globalThis.fetch;
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
    const events: string[] = [];
    const digest = `sha256:${'a'.repeat(64)}`;

    try {
      const promote = vi.fn(async (input: { organizationId: string; projectId: string }): Promise<PromotionResult> => {
        events.push('promote');
        const targetRepo = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${input.projectId.toLowerCase()}`;
        return {
          ok: true as const,
          target: { repo: targetRepo, digest },
          promotedAttestations: ['signature', 'sbom', 'provenance'],
          reused: false,
          manifest: {
            promotionId: 'promo-publish-route',
            sourceRepo: `europe-west9-docker.pkg.dev/build-project/build-repo/p-${input.projectId.toLowerCase()}`,
            sourceDigest: digest,
            targetRepo,
            targetTenant: input.organizationId,
            retentionTag: `active-promo-${'a'.repeat(32)}`,
            attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
              type,
              digest: `sha256:${String(index + 1).repeat(64)}`,
              subjectDigest: digest,
              relinked: true,
            })),
            binaryAuthorizationResult: 'PASSED' as const,
            binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
            binaryAuthorizationPolicyEtag: 'policy-etag-0001',
            binaryAuthorizationEvaluatedImage: `${targetRepo}@${digest}`,
            binaryAuthorizationEvaluatedAt: '2026-08-26T00:00:00.500Z',
            state: 'PROMOTION_COMMITTED' as const,
            preparedAt: '2026-08-26T00:00:00.000Z',
            committedAt: '2026-08-26T00:00:01.000Z',
          },
        };
      });
      const { app, store, token, project, projectManifestDigest } = await setup({
        serverImagePromotionRuntime: { promote },
      });
      globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        const href = String(url);

        if (href.includes('/server-deployments/start')) {
          events.push('manager-start');
          const body = JSON.parse(String(init?.body)) as { host: string };
          return new Response(JSON.stringify({ ready: true, readyReplicas: 1, url: `https://${body.host}` }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch;
      const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${project.id.toLowerCase()}`;
      const source = await store.createDeployment({
        projectId: project.id,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        url: 'https://preview-server.example/',
        metadata: {
          projectManifestDigest,
          serverDeploy: {
            image: { sourceImageRef: sourceRepo, imageRef: sourceRepo, imageDigest: digest },
          },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().deployment.status).toBe('READY');
      expect(events).toEqual(['promote', 'manager-start']);
      expect(store.releaseManifests).toHaveLength(1);
      expect(store.releaseManifests[0]).toMatchObject({
        environment: 'production',
        artifactKind: 'server-image',
        artifactDigest: digest,
      });
      await app.close();
    } finally {
      globalThis.fetch = realFetch;

      if (originalManagerUrl === undefined) {
        delete process.env.WORKSPACE_MANAGER_URL;
      } else {
        process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;
      }
    }
  });

  it('fails closed on total promotion-provider failure: no runtime, production row or manifest', async () => {
    const promote = vi.fn(async () => {
      throw Object.assign(new Error('provider unavailable'), { code: 'REGISTRY_REQUEST_FAILED' });
    });
    const realFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn() as unknown as typeof fetch;
      const { app, store, token, project, projectManifestDigest } = await setup({
        serverImagePromotionRuntime: { promote },
      });
      const digest = `sha256:${'a'.repeat(64)}`;
      const sourceRepo = `europe-west9-docker.pkg.dev/build-project/build-repo/p-${project.id.toLowerCase()}`;
      const source = await store.createDeployment({
        projectId: project.id,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        metadata: {
          projectManifestDigest,
          serverDeploy: { image: { sourceImageRef: sourceRepo, imageDigest: digest } },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/deployments/${source.id}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'REGISTRY_REQUEST_FAILED', retryable: true });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect((await store.listDeployments(project.id)).filter((row) => row.environment === 'production')).toEqual([]);
      expect(store.releaseManifests).toEqual([]);
      await app.close();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
