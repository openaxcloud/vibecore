import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

/*
 * Explicit opt-in: an unavailable database fails the run instead of silently skipping.
 * Use only an isolated, migrated local database; no provider or identity mocks.
 */
const enabled = process.env.PANEL_POSTGRES_PROOF === '1';

const responseSchema = z
  .object({
    code: z.string().optional(),
    project: z.record(z.unknown()).optional(),
    envVar: z.object({ id: z.string() }).passthrough().optional(),
    envVars: z.array(z.record(z.unknown())).optional(),
    activity: z.array(z.object({ metadata: z.record(z.unknown()) }).passthrough()).optional(),
  })
  .passthrough();

describe.skipIf(!enabled)('panel actions — HTTP and PostgreSQL persistence', () => {
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;

  const users: string[] = [];
  const organizations: string[] = [];
  const tokens: string[] = [];

  let projectId: string;

  async function request(method: string, path: string, payload?: unknown, actor = 0) {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { authorization: `Bearer ${tokens[actor]}`, 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, body: responseSchema.parse(await response.json()) };
  }

  async function restart() {
    await app.close();
    await store.prisma.$disconnect();
    store = new PrismaApiStore();
    app = await buildApiApp({ store });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/panel_proof') {
      throw new Error('Use a disposable localhost database named panel_proof');
    }

    store = new PrismaApiStore();
    await store.ping();

    for (let index = 0; index < 2; index++) {
      const suffix = randomUUID();

      const user = await store.createUser({
        email: `panel-${suffix}@example.test`,
        name: 'Panel proof',
        passwordHash: 'login-disabled-synthetic-fixture',
      });
      users.push(user.id);

      const org = await store.createOrganization({
        name: 'Panel proof',
        slug: `panel-${suffix}`,
        ownerUserId: user.id,
      });
      organizations.push(org.id);
      tokens.push(randomUUID());
      await store.createSession({ userId: user.id, token: tokens[index], expiresAt: new Date(Date.now() + 3_600_000) });
    }

    const project = await store.createProject({
      organizationId: organizations[0],
      name: 'Original',
      slug: `panel-${randomUUID()}`,
      description: 'Original description',
    });
    projectId = project.id;
    app = await buildApiApp({ store });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app?.close();

    if (store) {
      // Only IDs created by this run; never reset a database or remove shared roles.
      await store.prisma.project.deleteMany({ where: { id: projectId ?? 'not-created' } });
      await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.prisma.$disconnect();
    }
  });

  it('rejects an invalid slug without persisting metadata, including a repeated request', async () => {
    const path = `/projects/${projectId}/settings`;
    const before = await request('GET', path);
    expect(before.status).toBe(200);

    for (let attempt = 0; attempt < 2; attempt++) {
      const rejected = await request('PATCH', path, { name: 'Must not persist', description: 'Rejected', slug: '!!!' });
      expect(rejected.status).toBe(400);
      expect(rejected.body.code).toBe('PROJECT_SLUG_INVALID');
    }
    await restart();
    expect((await request('GET', path)).body.project).toEqual(before.body.project);
  });

  it('persists project edits after reconnect and rejects foreign organization edits and reads', async () => {
    const path = `/projects/${projectId}/settings`;
    const payload = { name: 'Updated project', description: 'Persistent description' };

    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await request('PATCH', path, payload)).status).toBe(200);
    }
    expect((await request('PATCH', path, { name: 'Foreign' }, 1)).status).toBe(404);
    expect((await request('GET', path, undefined, 1)).status).toBe(404);
    expect((await request('PATCH', path, { name: '   ' })).status).toBe(400);
    await restart();

    const observed = await request('GET', path);
    expect(observed.status).toBe(200);
    expect(observed.body.project).toMatchObject(payload);
  });

  it('creates and updates scoped variables without duplicates, survives reconnect and rejects foreign access', async () => {
    const path = `/projects/${projectId}/env-vars`;

    for (const scope of ['development', 'production']) {
      const created = await request('PUT', path, { key: 'PANEL_PROOF_VALUE', value: scope, scope });
      expect(created.status).toBe(200);

      for (let attempt = 0; attempt < 2; attempt++) {
        const updated = await request('PUT', path, { key: 'PANEL_PROOF_VALUE', value: `${scope}-updated`, scope });
        expect(updated.status).toBe(200);
        expect(updated.body.envVar?.id).toBeDefined();
        expect(updated.body.envVar?.id).toBe(created.body.envVar?.id);
      }
    }
    expect((await request('GET', path, undefined, 1)).status).toBe(404);
    expect((await request('PUT', path, { key: 'PANEL_PROOF_VALUE', value: 'foreign' }, 1)).status).toBe(404);
    expect((await request('DELETE', path, { key: 'PANEL_PROOF_VALUE' }, 1)).status).toBe(404);
    expect((await request('PUT', path, { key: 'PANEL_PROOF_VALUE', value: 'invalid', scope: 'invalid' })).status).toBe(
      400,
    );
    await restart();

    const observed = await request('GET', path);
    expect(observed.status).toBe(200);
    expect(observed.body.envVars).toHaveLength(2);
    expect(observed.body.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'PANEL_PROOF_VALUE', scope: 'development', value: 'development-updated' }),
        expect.objectContaining({ key: 'PANEL_PROOF_VALUE', scope: 'production', value: 'production-updated' }),
      ]),
    );
  });

  it('deletes only the requested scope and reports repeated deletion after reconnect', async () => {
    const path = `/projects/${projectId}/env-vars`;
    expect((await request('DELETE', path, { key: 'PANEL_PROOF_VALUE', scope: 'development' })).status).toBe(200);
    await restart();

    const repeated = await request('DELETE', path, { key: 'PANEL_PROOF_VALUE', scope: 'development' });
    expect(repeated.status).toBe(404);
    expect(repeated.body.code).toBe('PROJECT_ENV_NOT_FOUND');

    const observed = await request('GET', path);
    expect(observed.status).toBe(200);
    expect(observed.body.envVars).toHaveLength(1);
    expect(observed.body.envVars?.[0]).toMatchObject({ scope: 'production', value: 'production-updated' });
  });

  it('persists partial preference updates and null clearing without changing the other account', async () => {
    const path = '/user/preferences';
    const neighbor = await request('GET', path, undefined, 1);
    expect(neighbor.status).toBe(200);
    expect(
      (await request('PATCH', path, { language: 'fr', timezone: 'Europe/Paris', preferences: { theme: 'dark' } }))
        .status,
    ).toBe(200);

    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await request('PATCH', path, { timezone: null, preferences: { editorFontSize: 16 } })).status).toBe(200);
    }
    expect((await request('PATCH', path, { language: 'invalid-language' })).status).toBe(400);
    await restart();

    const observed = await request('GET', path);
    expect(observed.status).toBe(200);
    expect(observed.body).toEqual({
      language: 'fr',
      timezone: null,
      preferences: { theme: 'dark', editorFontSize: 16 },
    });
    expect((await request('GET', path, undefined, 1)).body).toEqual(neighbor.body);
  });

  it('persists exact activity counts and filters, isolates the journal, and rejects invalid queries', async () => {
    await restart();

    const path = `/projects/${projectId}/activity`;
    const observed = await request('GET', `${path}?action=project.env.upsert&order=asc`);
    expect(observed.status).toBe(200);
    expect(observed.body.activity).toHaveLength(6);

    for (const event of observed.body.activity!) {
      expect(event).toMatchObject({
        action: 'project.env.upsert',
        actorUserId: users[0],
        metadata: { key: 'PANEL_PROOF_VALUE' },
      });
      expect(event.metadata).not.toHaveProperty('value');
    }

    const deleted = await request('GET', `${path}?action=project.env.delete`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.activity).toHaveLength(1);
    expect((await request('GET', `${path}?limit=0`)).status).toBe(400);
    expect((await request('GET', path, undefined, 1)).status).toBe(404);
    expect((await request('GET', `${path}?action=project.env.upsert&order=asc`)).body).toEqual(observed.body);
  });
});
