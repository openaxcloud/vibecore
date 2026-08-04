import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { staticDeploymentSnapshotDir } from '../deployments.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { EmailProvider } from '../email.js';

/*
 * P103 — private deployments against a REAL Postgres (PrismaApiStore). Skipped
 * unless DATABASE_URL points at a migrated database. Proves the access config
 * persists to and is read from real PG, and that the serve enforcement holds
 * end-to-end through the real store.
 *
 * Run: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/vibecore \
 *      pnpm exec vitest run src/tests/deployment-private.integration.spec.ts
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('P103 private deployments — real Postgres', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let store: PrismaApiStore;
  let storageDir: string;
  const prevStorage = process.env.STATIC_DEPLOY_STORAGE_DIR;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'priv-pg-'));
    process.env.STATIC_DEPLOY_STORAGE_DIR = storageDir;
    store = new PrismaApiStore();
    app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
  });

  afterAll(async () => {
    if (prevStorage === undefined) delete process.env.STATIC_DEPLOY_STORAGE_DIR;
    else process.env.STATIC_DEPLOY_STORAGE_DIR = prevStorage;
    await rm(storageDir, { recursive: true, force: true }).catch(() => {});
    await app?.close().catch(() => {});
  });

  async function register(tag: string) {
    const email = `p103-${tag}-${randomUUID().slice(0, 8)}@local.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'U', organizationName: `${email} Org` },
    });
    expect(reg.statusCode).toBe(201);
    const auth = reg.json() as { token: string; organization: { id: string }; user: { id: string } };
    await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    return { ...auth, email };
  }

  it('persists mode=private to real PG and enforces it end-to-end', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');

    const proj = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'PG Priv Project' },
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
    await writeFile(join(dir, 'index.html'), '<!doctype html><body>PG PRIVATE CONTENT</body>', 'utf8');

    // Set private via the real API → persists to Postgres.
    const set = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/deployments/${deployment.id}/access`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { mode: 'private' },
    });
    expect(set.statusCode).toBe(200);

    // Read it BACK from real PG (fresh query through the store) — the DB extract.
    const persisted = await store.getDeployment(projectId, deployment.id);
    expect((persisted?.metadata as any)?.access).toEqual({ mode: 'private' });
    // The public URL flipped to the API origin (where the session cookie works).
    expect(persisted?.url).toContain(`/static-deployments/${deployment.id}/`);

    const serve = (token?: string) =>
      app.inject({
        method: 'GET',
        url: `/static-deployments/${deployment.id}/`,
        ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      });

    expect((await serve()).statusCode).toBe(401); // anonymous
    expect((await serve(stranger.token)).statusCode).toBe(401); // other-org member
    const asOwner = await serve(owner.token);
    expect(asOwner.statusCode).toBe(200); // member
    expect(asOwner.body).toContain('PG PRIVATE CONTENT');

    // Raw-SQL DB extract (the on-disk-PG proof).
    const raw = await store.prisma.$queryRawUnsafe(
      `SELECT id, metadata->'access' AS access, "url", "environmentName" FROM "Deployment" WHERE id = $1`,
      deployment.id,
    );
    console.log('P103_DB_EXTRACT', JSON.stringify(raw));
    expect((raw as Array<{ access: unknown }>)[0].access).toEqual({ mode: 'private' });

    // Cleanup: cascade-delete the throwaway orgs.
    await store.prisma.organization.deleteMany({ where: { id: { in: [owner.organization.id, stranger.organization.id] } } });
  });
});
