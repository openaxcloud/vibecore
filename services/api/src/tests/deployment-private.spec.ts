import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * P103 — private deployments (endpoint wiring). A private deployment serves NO
 * byte to anyone who is not an authenticated member of the owning organization.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('private static deployments (endpoint)', () => {
  const prev = process.env.STATIC_DEPLOY_STORAGE_DIR;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'priv-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prev;
    await rm(storageDir, { recursive: true, force: true });
  });

  async function register(app: any, store: TestApiStore, email: string) {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'U', organizationName: `${email} Org` },
    });
    const auth = reg.json() as { token: string; organization: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    return auth;
  }

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const owner = await register(app, store, 'owner@example.com');
    const stranger = await register(app, store, 'stranger@example.com'); // different org
    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Priv Project' },
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
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>PRIVATE CONTENT</body>', 'utf8');
    return { app, store, owner, stranger, projectId, deploymentId: deployment.id };
  }

  const setPrivate = (app: any, projectId: string, deploymentId: string, token: string) =>
    app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      headers: { authorization: `Bearer ${token}` },
      payload: { mode: 'private' },
    });
  const serve = (app: any, deploymentId: string, token?: string) =>
    app.inject({
      method: 'GET',
      url: `/static-deployments/${deploymentId}/`,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });

  it('serves publicly by default', async () => {
    const { app, deploymentId } = await setup();
    expect((await serve(app, deploymentId)).statusCode).toBe(200);
  });

  it('once private: anon 401, non-member 401, owner/member 200', async () => {
    const { app, owner, stranger, projectId, deploymentId } = await setup();

    const set = await setPrivate(app, projectId, deploymentId, owner.token);
    expect(set.statusCode).toBe(200);
    expect((set.json() as { accessMode: string }).accessMode).toBe('private');

    // Anonymous → 401, no content.
    const anon = await serve(app, deploymentId);
    expect(anon.statusCode).toBe(401);
    expect((anon.json() as { code: string }).code).toBe('DEPLOYMENT_PRIVATE');
    expect(anon.body).not.toContain('PRIVATE CONTENT');

    // A member of ANOTHER org → 401 (not a member of the owning org).
    const outsider = await serve(app, deploymentId, stranger.token);
    expect(outsider.statusCode).toBe(401);
    expect(outsider.body).not.toContain('PRIVATE CONTENT');

    // The owner (a member) → 200 + content.
    const asOwner = await serve(app, deploymentId, owner.token);
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.body).toContain('PRIVATE CONTENT');
  });

  it('a stranger cannot set access mode (denied: 404 hides project existence)', async () => {
    const { app, stranger, projectId, deploymentId } = await setup();
    const res = await setPrivate(app, projectId, deploymentId, stranger.token);
    expect([401, 403, 404]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(200);
  });

  it('switching back to public re-opens it', async () => {
    const { app, owner, projectId, deploymentId } = await setup();
    await setPrivate(app, projectId, deploymentId, owner.token);
    expect((await serve(app, deploymentId)).statusCode).toBe(401);
    const pub = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deploymentId}/access`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { mode: 'public' },
    });
    expect(pub.statusCode).toBe(200);
    expect((await serve(app, deploymentId)).statusCode).toBe(200);
  });
});
