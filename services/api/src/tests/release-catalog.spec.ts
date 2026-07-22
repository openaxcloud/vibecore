import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * CTR-RELEASE-PUBLISH — persistent ReleaseCatalog.
 *
 * Proves the catalog is a real DB-backed source of truth: publishes append
 * immutable, monotonically-versioned entries pinning the image by DIGEST; the
 * history endpoint returns them; and redeploy-from-history re-runs an entry's
 * image BY DIGEST via the manager — independent of whether the source deployment
 * still exists (I-PUB-3 / I-REL-1). Negative cases refuse loudly, never fake.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj';
const DIGEST = 'sha256:' + 'c'.repeat(64);

describe('ReleaseCatalog store — monotonic, ordered, project-scoped', () => {
  it('assigns a monotonic per-project version and lists history newest-first', async () => {
    const store = new TestApiStore();
    const r1 = await store.createReleaseCatalogEntry({ projectId: 'p1', imageRef: IMAGE_REF, imageDigest: DIGEST });
    const r2 = await store.createReleaseCatalogEntry({ projectId: 'p1', imageRef: IMAGE_REF, imageDigest: DIGEST });

    // A different project has its own independent version sequence.
    const other = await store.createReleaseCatalogEntry({ projectId: 'p2', imageRef: IMAGE_REF, imageDigest: DIGEST });

    expect(r1.version).toBe(1);
    expect(r2.version).toBe(2);
    expect(other.version).toBe(1);

    const history = await store.listReleaseCatalog('p1');
    expect(history.map((r) => r.version)).toEqual([2, 1]); // newest first

    // getReleaseCatalogEntry is project-scoped: p2's release is invisible under p1.
    expect(await store.getReleaseCatalogEntry('p1', other.id)).toBeUndefined();
    expect((await store.getReleaseCatalogEntry('p2', other.id))?.id).toBe(other.id);
  });
});

describe('ReleaseCatalog endpoints — history + redeploy-from-history (wiring)', () => {
  const prevManagerUrl = process.env.WORKSPACE_MANAGER_URL;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.test';
  });
  afterEach(() => {
    if (prevManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = prevManagerUrl;
    }

    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function stubManagerStart(): { starts: Array<Record<string, unknown>> } {
    const starts: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: { body?: string }) => {
      const href = typeof url === 'string' ? url : String(url);

      if (href.includes('/server-deployments/start')) {
        const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        starts.push(body);

        return new Response(
          JSON.stringify({ ready: true, url: `https://${body.host as string}`, name: 'app', readyReplicas: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    return { starts };
  }

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'rc@example.com', password: 'password123', name: 'RC', organizationName: 'RC Org' },
    });

    const auth = register.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'RC Project' },
    });

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { app, store, auth, projectId };
  }

  const hdr = (t: string) => ({ authorization: `Bearer ${t}` });

  it('GET /releases returns the persisted history, newest version first', async () => {
    const { app, store, auth, projectId } = await setup();
    await store.createReleaseCatalogEntry({ projectId, imageRef: IMAGE_REF, imageDigest: DIGEST });
    await store.createReleaseCatalogEntry({ projectId, imageRef: IMAGE_REF, imageDigest: DIGEST });

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/releases`, headers: hdr(auth.token) });
    expect(res.statusCode).toBe(200);

    const releases = res.json().releases as Array<{ version: number; imageDigest: string }>;
    expect(releases.map((r) => r.version)).toEqual([2, 1]);
    expect(releases[0].imageDigest).toBe(DIGEST);

    await app.close();
  });

  it('redeploys a release BY DIGEST via the manager (revision-independent, I-PUB-3)', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    /*
     * A release whose source deployment id does NOT exist — proves the catalog is
     * self-sufficient: redeploy resolves ENTIRELY from the persisted digest.
     */
    const release = await store.createReleaseCatalogEntry({
      projectId,
      imageRef: IMAGE_REF,
      imageDigest: DIGEST,
      publishedByDeploymentId: 'deployment-that-was-deleted',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/releases/${release.id}/redeploy`,
      headers: hdr(auth.token),
    });

    expect(res.statusCode).toBe(201);

    const start = captured.starts.find((s) => String(s.image).includes('@sha256:'));
    expect(start).toBeDefined();
    expect(start!.image).toBe(`${IMAGE_REF}@${DIGEST}`); // immutable pull-by-digest

    const row = res.json().deployment;
    expect(row.status).toBe('READY');
    expect((row.metadata.serverDeploy as Record<string, unknown>).redeployedFromDigest).toBe(DIGEST);
    expect((row.metadata.serverDeploy as Record<string, unknown>).resolvedWithoutLiveRevision).toBe(true);

    // Provenance: the new deployment records which release it re-ran (no new version).
    expect((row.metadata as Record<string, unknown>).redeployedFromReleaseId).toBe(release.id);

    await app.close();
  });

  it('404s an unknown release; 404s a release from another project (isolation)', async () => {
    const { app, store, auth, projectId } = await setup();
    stubManagerStart();

    const unknown = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/releases/nope/redeploy`,
      headers: hdr(auth.token),
    });
    expect(unknown.statusCode).toBe(404);

    // A release that belongs to a DIFFERENT project must not be redeployable here.
    const foreign = await store.createReleaseCatalogEntry({
      projectId: 'some-other-project',
      imageRef: IMAGE_REF,
      imageDigest: DIGEST,
    });
    const crossed = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/releases/${foreign.id}/redeploy`,
      headers: hdr(auth.token),
    });
    expect(crossed.statusCode).toBe(404);

    await app.close();
  });

  it('REFUSES (409) a catalog entry with no digest — never a dead-URL redeploy', async () => {
    const { app, store, auth, projectId } = await setup();
    const captured = stubManagerStart();

    // A malformed/legacy entry with an empty digest must be refused, not faked.
    const release = await store.createReleaseCatalogEntry({ projectId, imageRef: IMAGE_REF, imageDigest: '' });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/releases/${release.id}/redeploy`,
      headers: hdr(auth.token),
    });

    expect(res.statusCode).toBe(409);

    // It must NOT have started any digest deploy.
    expect(captured.starts.some((s) => String(s.image).includes('@sha256:'))).toBe(false);

    await app.close();
  });
});
