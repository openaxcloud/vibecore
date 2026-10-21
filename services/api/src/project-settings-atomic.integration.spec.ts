import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

/*
 * Explicit opt-in: an unavailable database fails the run instead of silently skipping.
 * Use only an isolated, migrated local database; no provider or identity mocks.
 */
const enabled = process.env.SETTINGS_POSTGRES_PROOF === '1';

const responseSchema = z
  .object({
    code: z.string().optional(),
    project: z.record(z.unknown()).optional(),
    envVar: z.object({ id: z.string() }).passthrough().optional(),
    envVars: z.array(z.record(z.unknown())).optional(),
    activity: z.array(z.object({ metadata: z.record(z.unknown()) }).passthrough()).optional(),
  })
  .passthrough();

describe.skipIf(!enabled)('atomic project settings — HTTP and PostgreSQL', () => {
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;

  const users: string[] = [];
  const organizations: string[] = [];
  const tokens: string[] = [];

  let projectId: string;

  const projectIds: string[] = [];

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
    projectIds.push(project.id);
    app = await buildApiApp({ store });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app?.close();

    if (store) {
      // Only IDs created by this run; never reset a database or remove shared roles.
      await store.prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.prisma.$disconnect();
    }
  });

  async function newProject(slug: string) {
    const project = await store.createProject({
      organizationId: organizations[0],
      name: 'Original',
      slug,
      description: 'Before',
    });
    projectIds.push(project.id);

    return project;
  }

  it('rolls back all metadata on repeated 409 collision and leaves no redirect after reconnect', async () => {
    const target = await newProject(`taken-${randomUUID()}`);
    const path = `/projects/${projectId}/settings`;
    const before = await request('GET', path);
    expect(before.status).toBe(200);

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request('PATCH', path, {
        name: 'Rejected',
        description: 'Rejected',
        gitDefaultBranch: 'rejected',
        slug: target.slug,
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PROJECT_SLUG_TAKEN');
    }
    await restart();
    expect((await request('GET', path)).body.project).toEqual(before.body.project);
    expect(await store.prisma.projectSlugRedirect.count({ where: { projectId } })).toBe(0);
  });

  it('commits metadata, slug and redirect together, supports repetition and rename back', async () => {
    const project = await newProject(`rename-${randomUUID()}`);
    const path = `/projects/${project.id}/settings`;
    const slug = `renamed-${randomUUID()}`;
    const payload = { name: 'Renamed', description: 'New description', gitDefaultBranch: 'release', slug };
    expect((await request('PATCH', path, payload)).status).toBe(200);
    expect((await request('PATCH', path, payload)).status).toBe(200);
    await restart();
    expect((await request('GET', path)).body.project).toMatchObject(payload);
    expect(await store.prisma.projectSlugRedirect.findMany({ where: { projectId: project.id } })).toEqual([
      expect.objectContaining({ oldSlug: project.slug, projectId: project.id }),
    ]);
    expect((await request('PATCH', path, { slug: project.slug, name: 'Back' })).status).toBe(200);
    await restart();
    expect((await request('GET', path)).body.project).toMatchObject({ slug: project.slug, name: 'Back' });
    expect(await store.prisma.projectSlugRedirect.findMany({ where: { projectId: project.id } })).toEqual([
      expect.objectContaining({ oldSlug: slug }),
    ]);
  });

  it('concurrent claims of one unique slug commit exactly one complete project mutation', async () => {
    const a = await newProject(`race-a-${randomUUID()}`);
    const b = await newProject(`race-b-${randomUUID()}`);
    const projects = [a, b];
    const before = await Promise.all(projects.map((p) => request('GET', `/projects/${p.id}/settings`)));
    const slug = `winner-${randomUUID()}`;

    const responses = await Promise.all(
      projects.map((p, index) =>
        request('PATCH', `/projects/${p.id}/settings`, {
          slug,
          name: `Winner ${index}`,
          description: `Winner description ${index}`,
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);

    const winner = responses.findIndex((r) => r.status === 200);
    const loser = 1 - winner;
    expect(responses[loser].body.code).toBe('PROJECT_SLUG_TAKEN');
    await restart();
    expect((await request('GET', `/projects/${projects[winner].id}/settings`)).body.project).toMatchObject({
      slug,
      name: `Winner ${winner}`,
      description: `Winner description ${winner}`,
    });
    expect((await request('GET', `/projects/${projects[loser].id}/settings`)).body.project).toEqual(
      before[loser].body.project,
    );
    expect(await store.prisma.projectSlugRedirect.count({ where: { projectId: projects[winner].id } })).toBe(1);
    expect(await store.prisma.projectSlugRedirect.count({ where: { projectId: projects[loser].id } })).toBe(0);
  });

  it('rejects stale organization scope after a transfer wins the project row lock', async () => {
    const project = await newProject(`transfer-${randomUUID()}`);

    let release!: () => void;
    let locked!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const transfer = store.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { organizationId: organizations[1] } });
      locked();
      await gate;
    });
    await ready;

    const mutation = store.updateProjectSettings({
      projectId: project.id,
      organizationId: organizations[0],
      name: 'Stale owner',
      slug: `stale-${randomUUID()}`,
    });

    // Attach the rejection handler before releasing the transaction.
    const outcome = mutation.then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    );

    try {
      let waiting = false;

      for (let poll = 0; poll < 100 && !waiting; poll++) {
        const rows = await store.prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%SELECT id FROM "Project"%'`;
        waiting = Number(rows[0].count) > 0;
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await transfer;
    }
    expect((await outcome).error).toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    await restart();

    const path = `/projects/${project.id}/settings`;
    expect((await request('PATCH', path, { name: 'Old owner' })).status).toBe(404);
    expect((await request('GET', path, undefined, 1)).body.project).toMatchObject({
      organizationId: organizations[1],
      name: 'Original',
      slug: project.slug,
      description: 'Before',
    });
    expect(await store.prisma.projectSlugRedirect.count({ where: { projectId: project.id } })).toBe(0);
    expect((await request('PATCH', path, { name: 'New owner' }, 1)).status).toBe(200);
    await restart();
    expect((await request('GET', path, undefined, 1)).body.project).toMatchObject({ name: 'New owner' });
  });

  it('keeps projects:write checks after role downgrade and membership revocation', async () => {
    const project = await newProject(`permissions-${randomUUID()}`);
    const path = `/projects/${project.id}/settings`;
    await store.addMember({ organizationId: organizations[0], userId: users[1], roleKey: 'admin' });
    expect((await request('PATCH', path, { name: 'Authorized writer' }, 1)).status).toBe(200);

    const before = await request('GET', path);
    await store.addMember({ organizationId: organizations[0], userId: users[1], roleKey: 'viewer' });
    expect((await request('PATCH', path, { name: 'Denied viewer' }, 1)).status).toBe(403);
    await store.removeMember(organizations[0], users[1]);

    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await request('PATCH', path, { name: 'Revoked' }, 1)).status).toBe(404);
    }
    await restart();
    expect((await request('GET', path)).body.project).toEqual(before.body.project);
    expect(await store.prisma.projectSlugRedirect.count({ where: { projectId: project.id } })).toBe(0);
  });
});
