/*
 * P104 / SEC-8 — the cache window, against the REAL production route code.
 *
 * The kind/Docker harnesses under scripts/sec9-cutover/ prove the DEPLOY
 * SEQUENCE, but they drive a stub api. That leaves one honest gap: they show the
 * sequence is right, not that the real `/static-deployments/:id/*` route emits
 * headers a real shared cache will treat safely. This closes it — same attack,
 * but the origin here is `buildApiApp()` itself, bound to a real port, and it
 * runs in CI on every change.
 *
 * The cache below implements only the rule that creates the hazard, the way
 * RFC 9111 permits a shared cache to behave:
 *   `public, max-age=N`        -> stored, REUSED FOR N SECONDS WITHOUT asking the
 *                                 origin again. This is what made activating
 *                                 password protection defeatable.
 *   `no-cache`/`must-revalidate` -> may be stored, but must revalidate first.
 *   `no-store`                 -> never stored.
 *
 * Two things are asserted, and the first matters as much as the second:
 *   1. the cache really does replay a `max-age=60` entry (control) — otherwise
 *      test 2 would pass for the wrong reason and prove nothing;
 *   2. the real api's public response is NOT replayable that way, so once the
 *      owner activates protection the very next anonymous hit revalidates,
 *      traverses the gate and gets 401 with zero bytes of content.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { computeStaticSnapshotDigest, staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

type CacheEntry = { status: number; headers: Record<string, string>; body: Buffer; freshUntil: number };

const RELEASE_PLAN_ENTITLEMENTS = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro' as const,
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all' as const,
};

/** Minimal shared cache. Returns `x-cache: HIT | MISS | REVALIDATED`. */
function startSharedCache(originPort: number): Promise<{ server: Server; port: number; clear: () => void }> {
  const store = new Map<string, CacheEntry>();

  const server = createServer((req, res) => {
    const key = req.url ?? '/';
    const now = Date.now();
    const hit = store.get(key);

    if (hit && hit.freshUntil > now) {
      res.writeHead(hit.status, { ...hit.headers, 'x-cache': 'HIT' });
      res.end(hit.body);

      return;
    }

    const upstream = httpRequest(
      { host: '127.0.0.1', port: originPort, path: key, method: 'GET', headers: { cookie: req.headers.cookie ?? '' } },
      (originRes) => {
        const chunks: Buffer[] = [];
        originRes.on('data', (c: Buffer) => chunks.push(c));
        originRes.on('end', () => {
          const body = Buffer.concat(chunks);
          const cc = String(originRes.headers['cache-control'] ?? '');
          const maxAgeMatch = /max-age=(\d+)/.exec(cc);
          const maxAge = cc.includes('no-cache') ? 0 : Number(maxAgeMatch?.[1] ?? 0);

          if (cc.includes('public') && !cc.includes('no-store') && maxAge > 0) {
            store.set(key, {
              status: originRes.statusCode ?? 200,
              headers: originRes.headers as Record<string, string>,
              body,
              freshUntil: now + maxAge * 1000,
            });
          }

          res.writeHead(originRes.statusCode ?? 200, {
            ...(originRes.headers as Record<string, string>),
            'x-cache': hit ? 'REVALIDATED' : 'MISS',
          });
          res.end(body);
        });
      },
    );

    upstream.on('error', () => {
      res.writeHead(502);
      res.end('upstream error');
    });
    upstream.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('cache failed to start');
      }

      resolve({ server, port: address.port, clear: () => store.clear() });
    });
  });
}

describe('SEC-8 cache window — real api behind a real shared cache', () => {
  const prevDir = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevActivation = process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
  const prevSecret = process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
  let storageDir: string;
  const closers: Array<() => Promise<void> | void> = [];

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'cachewin-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = 'cache-window-secret-that-is-at-least-32-bytes';
    process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1';
  });

  afterEach(async () => {
    while (closers.length) {
      await closers.pop()?.();
    }

    if (prevDir === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prevDir;
    if (prevActivation === undefined) delete process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED;
    else process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = prevActivation;
    if (prevSecret === undefined) delete process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
    else process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = prevSecret;

    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    await app.listen({ port: 0, host: '127.0.0.1' });
    closers.push(() => app.close());

    const address = app.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('api failed to start');
    }

    const cache = await startSharedCache(address.port);
    closers.push(() => new Promise<void>((resolve) => cache.server.close(() => resolve())));

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'cw@example.com', password: 'password123', name: 'C', organizationName: 'C Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'C Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;
    const projectManifest = await store.getLatestProjectManifest(projectId);
    if (!projectManifest) throw new Error('TEST_PROJECT_MANIFEST_MISSING');

    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
      metadata: {
        planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
        projectManifestDigest: projectManifest.digest,
      },
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');
    const artifactDigest = (await computeStaticSnapshotDigest(deployment.id))!;
    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version: 1,
      provider: 'static',
      artifactKind: 'static-snapshot',
      artifactRef: `static-artifacts/sha256/${artifactDigest.slice('sha256:'.length)}`,
      artifactDigest,
      accessPolicyVersion: deployment.accessPolicyVersion,
      planEntitlements: RELEASE_PLAN_ENTITLEMENTS,
      projectManifestDigest: projectManifest.digest,
    });

    const throughCache = async (path: string) => {
      const res = await fetch(`http://127.0.0.1:${cache.port}${path}`);

      return {
        status: res.status,
        cache: res.headers.get('x-cache'),
        cc: res.headers.get('cache-control'),
        body: await res.text(),
      };
    };

    const activate = () =>
      app.inject({
        method: 'PUT',
        url: `/projects/${projectId}/deployments/${deployment.id}/access`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          mode: 'PASSWORD_PROTECTED',
          password: 'cache-window-password',
          expectedVersion: deployment.accessPolicyVersion,
        },
      });

    return { app, cache, throughCache, activate, deploymentId: deployment.id };
  }

  it('CONTROL: the cache really does replay a max-age=60 entry without asking the origin', async () => {
    /*
     * Without this, the real test below could pass simply because the cache never
     * caches anything, and would prove nothing at all. Point the same cache at a
     * throwaway origin that emits the PRE-cutover header and watch it replay —
     * including after the origin starts refusing everyone.
     */
    let originHits = 0;
    let locked = false;
    const origin = createServer((_req, res) => {
      originHits += 1;

      if (locked) {
        res.writeHead(401, { 'cache-control': 'private, no-store' });
        res.end('Password required');

        return;
      }

      res.writeHead(200, { 'cache-control': 'public, max-age=60', 'content-type': 'text/html' });
      res.end('<!doctype html><body>SECRET CONTENT</body>');
    });

    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    const originAddress = origin.address();

    if (!originAddress || typeof originAddress === 'string') {
      throw new Error('origin failed to start');
    }

    closers.push(() => new Promise<void>((resolve) => origin.close(() => resolve())));

    const cache = await startSharedCache(originAddress.port);
    closers.push(() => new Promise<void>((resolve) => cache.server.close(() => resolve())));

    const first = await fetch(`http://127.0.0.1:${cache.port}/`);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(await first.text()).toContain('SECRET CONTENT');

    // The origin now protects the resource — exactly the moment of activation.
    locked = true;
    const hitsBefore = originHits;

    const replay = await fetch(`http://127.0.0.1:${cache.port}/`);
    expect(replay.headers.get('x-cache')).toBe('HIT');
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain('SECRET CONTENT');

    // Proof it never consulted the now-protecting origin.
    expect(originHits).toBe(hitsBefore);
  });

  it('the REAL api is not replayable: activation takes effect on the very next anonymous hit', async () => {
    const { throughCache, activate, deploymentId } = await setup();
    const path = `/static-deployments/${deploymentId}/`;

    const before = await throughCache(path);
    expect(before.status).toBe(200);
    expect(before.body).toContain('SECRET CONTENT');
    // The header that makes the difference: storable, but never reusable as-is.
    expect(before.cc).toContain('no-cache');
    expect(before.cc).not.toMatch(/max-age=[1-9]/);

    expect((await activate()).statusCode).toBe(200);

    const after = await throughCache(path);
    expect(after.status).toBe(401);
    expect(after.cache).not.toBe('HIT');
    expect(after.body).not.toContain('SECRET CONTENT');
  });
});
