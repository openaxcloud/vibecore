import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import { accessCookieName, computeAccessToken } from '../deployment-access.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

// A known dedicated secret so the tests can mint expired / valid tokens directly.
const DEP_SECRET = 'test-deployment-access-secret';

/*
 * P104 — password-protected deployments (endpoint wiring).
 *
 * Proves the real routes: owner sets a password, an anonymous visitor gets 401
 * (no bytes), the wrong password is refused, the right password sets a cookie
 * that unlocks the serve, and switching back to public re-opens it.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('password-protected static deployments (endpoint)', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  const prevSecret = process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'pwd-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = DEP_SECRET;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    if (prevSecret === undefined) delete process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET;
    else process.env.DEPLOYMENT_ACCESS_TOKEN_SECRET = prevSecret;
    await rm(storageDir, { recursive: true, force: true });
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'pwd@example.com', password: 'password123', name: 'P', organizationName: 'P Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'P Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;

    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');

    return { app, store, auth, projectId, deploymentId: deployment.id };
  }

  const setAccess = (app: any, projectId: string, deploymentId: string, token: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  const serve = (app: any, deploymentId: string, cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/static-deployments/${deploymentId}/`, ...(cookies ? { cookies } : {}) });

  it('serves publicly by default', async () => {
    const { app, deploymentId } = await setup();
    const res = await serve(app, deploymentId);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('SECRET CONTENT');
  });

  it('gates anonymous access once a password is set, and unlocks with the right one', async () => {
    const { app, auth, projectId, deploymentId } = await setup();

    const set = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    expect(set.statusCode).toBe(200);
    expect((set.json() as { accessMode: string }).accessMode).toBe('password');

    // Anonymous → 401, no content leaked.
    const anon = await serve(app, deploymentId);
    expect(anon.statusCode).toBe(401);
    expect(anon.body).not.toContain('SECRET CONTENT');

    // Wrong password → 401, no cookie.
    const wrong = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deploymentId}/__access`,
      payload: { password: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect((wrong.json() as { code: string }).code).toBe('DEPLOYMENT_PASSWORD_INCORRECT');

    // Right password → 200 + Set-Cookie.
    const gate = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deploymentId}/__access`,
      payload: { password: 'letmein' },
    });
    expect(gate.statusCode).toBe(200);
    const cookie = gate.cookies.find((c) => c.name === accessCookieName(deploymentId));
    if (!cookie) throw new Error('access cookie was not set');
    expect(cookie.httpOnly).toBe(true);

    // Serve WITH the cookie → 200 + content.
    const unlocked = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: cookie.value });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.body).toContain('SECRET CONTENT');

    // A forged/other-deployment cookie value does NOT unlock.
    const forged = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: 'forged-token' });
    expect(forged.statusCode).toBe(401);
  });

  it('rotating the password invalidates the old cookie', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'first' });
    const g1 = await app.inject({ method: 'POST', url: `/static-deployments/${deploymentId}/__access`, payload: { password: 'first' } });
    const g1Cookie = g1.cookies.find((c) => c.name === accessCookieName(deploymentId));
    if (!g1Cookie) throw new Error('access cookie was not set');
    const oldCookie = g1Cookie.value;

    // Rotate.
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'second' });
    const stale = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: oldCookie });
    expect(stale.statusCode).toBe(401);
  });

  it('switching back to public re-opens it', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    expect((await serve(app, deploymentId)).statusCode).toBe(401);

    const pub = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'public' });
    expect(pub.statusCode).toBe(200);
    const open = await serve(app, deploymentId);
    expect(open.statusCode).toBe(200);
    expect(open.body).toContain('SECRET CONTENT');
  });

  it('rejects mode=password without a password (400) and requires owner auth (401)', async () => {
    const { app, auth, projectId, deploymentId } = await setup();
    const noPw = await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password' });
    expect(noPw.statusCode).toBe(400);
    const noAuth = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      payload: { mode: 'password', password: 'x1234' },
    });
    expect(noAuth.statusCode).toBe(401);
  });

  // ---- expert P0 security counter-audit (SEC-1..6) --------------------------

  it('SEC-2/3: every gated response is no-store (never public) with Vary: Cookie — no cache poisoning', async () => {
    const { app, store, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });

    // (a) the 401 gate must not be cacheable as public
    const anon = await serve(app, deploymentId);
    expect(anon.statusCode).toBe(401);
    const anonCache = String(anon.headers['cache-control'] ?? '');
    expect(anonCache).toContain('no-store');
    expect(anonCache).not.toContain('public');

    // (b) the AUTHORIZED 200 must ALSO be no-store + Vary: Cookie, so a shared
    // cache can never store it and replay to an anonymous visitor (poisoning).
    const dep = await store.getDeployment(projectId, deploymentId);
    const passwordHash = ((dep!.metadata as any).access as { passwordHash: string }).passwordHash;
    const valid = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() + 3_600_000);
    const ok = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: valid });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('SECRET CONTENT');
    const okCache = String(ok.headers['cache-control'] ?? '');
    expect(okCache).toContain('no-store');
    expect(okCache).not.toContain('public');
    expect(String(ok.headers['vary'] ?? '').toLowerCase()).toContain('cookie');

    // (c) cache-poisoning replay: after the authorized fetch, the SAME URL fetched
    // anonymously still leaks NO protected byte.
    const replay = await serve(app, deploymentId);
    expect(replay.statusCode).toBe(401);
    expect(replay.body).not.toContain('SECRET CONTENT');
  });

  it('SEC-5: an EXPIRED (server-verified) token is refused even though the cookie is present', async () => {
    const { app, store, auth, projectId, deploymentId } = await setup();
    await setAccess(app, projectId, deploymentId, auth.token, { mode: 'password', password: 'letmein' });
    const dep = await store.getDeployment(projectId, deploymentId);
    const passwordHash = ((dep!.metadata as any).access as { passwordHash: string }).passwordHash;

    const expired = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() - 1_000);
    const res = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: expired });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('SECRET CONTENT');

    const valid = computeAccessToken(DEP_SECRET, deploymentId, passwordHash, Date.now() + 60_000);
    const ok = await serve(app, deploymentId, { [accessCookieName(deploymentId)]: valid });
    expect(ok.statusCode).toBe(200);
  });

  it('SEC-1: a password deployment whose stored hash is gone is LOCKED (503), never public', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'lock@example.com', password: 'password123', name: 'L', organizationName: 'L Org' },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${auth.organization.id}/projects`,
      headers: { authorization: `Bearer ${auth.token}` },
      payload: { name: 'L Project' },
    });
    const projectId = (proj.json() as { project: { id: string } }).project.id;
    // Corrupt/partial config: mode=password but NO hash.
    const deployment = await store.createDeployment({
      projectId,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://example.test/x',
      metadata: { access: { mode: 'password' } },
    });
    const dir = staticDeploymentSnapshotDir(deployment.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>SECRET CONTENT</body>', 'utf8');

    const res = await serve(app, deployment.id);
    expect(res.statusCode).toBe(503);
    expect((res.json() as { code: string }).code).toBe('DEPLOYMENT_ACCESS_LOCKED');
    expect(res.body).not.toContain('SECRET CONTENT');

    // The unlock endpoint also refuses (nothing to unlock).
    const gate = await app.inject({
      method: 'POST',
      url: `/static-deployments/${deployment.id}/__access`,
      payload: { password: 'anything' },
    });
    expect(gate.statusCode).toBe(503);
  });
});
