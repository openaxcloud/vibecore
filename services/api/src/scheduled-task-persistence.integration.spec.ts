import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

/*
 * Explicit opt-in: an unavailable database fails the run instead of silently skipping.
 * Use only an isolated, migrated local database; no provider or identity mocks.
 */
const enabled = process.env.SCHEDULE_POSTGRES_PROOF === '1';

const taskSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    command: z.string(),
    enabled: z.boolean(),
    nextRunAt: z.string().nullable(),
  })
  .passthrough();
const responseSchema = z
  .object({ code: z.string().optional(), task: taskSchema.optional(), tasks: z.array(taskSchema).optional() })
  .passthrough();

describe.skipIf(!enabled)('scheduled task configuration — real HTTP and PostgreSQL', () => {
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;

  const users: string[] = [];
  const organizations: string[] = [];
  const tokens: string[] = [];

  let projectId: string;
  let taskId: string;

  async function request(method: string, path: string, payload?: unknown, actor = 0) {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${tokens[actor]}`,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return {
      status: response.status,
      body: response.status === 204 ? {} : responseSchema.parse(await response.json()),
    };
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

    expect(process.env.NODE_ENV).toBe('test');
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
      await store.prisma.scheduledTaskRun.deleteMany({ where: { projectId: projectId ?? 'not-created' } });
      await store.prisma.scheduledTask.deleteMany({ where: { projectId: projectId ?? 'not-created' } });
      await store.prisma.project.deleteMany({ where: { id: projectId ?? 'not-created' } });
      await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.prisma.$disconnect();
    }
  });

  const config = {
    name: 'Scheduled proof',
    command: 'printf scheduled-proof',
    cron: '0 0 * * *',
    timezone: 'UTC',
    enabled: false,
  };

  async function readTask() {
    const result = await request('GET', `/projects/${projectId}/scheduled-tasks`);
    expect(result.status).toBe(200);
    expect(result.body.tasks).toHaveLength(1);

    return result.body.tasks![0];
  }

  it('creates a disabled schedule and persists it after reconnect; invalid creation writes nothing', async () => {
    const path = `/projects/${projectId}/scheduled-tasks`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const invalid = await request('POST', path, { ...config, command: '   ' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('SCHEDULED_TASK_NO_COMMAND');
    }

    const created = await request('POST', path, config);
    expect(created.status).toBe(201);
    expect(created.body.task?.id).toBeDefined();
    taskId = created.body.task!.id;
    await restart();
    expect(await readTask()).toMatchObject({ ...config, id: taskId, nextRunAt: null });
  });

  it('rejects a blank deployment command on update without changing any persisted fields', async () => {
    const before = await readTask();

    for (let attempt = 0; attempt < 2; attempt++) {
      const rejected = await request('PATCH', `/projects/${projectId}/scheduled-tasks/${taskId}`, {
        name: 'Rejected rename',
        command: '   ',
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.code).toBe('SCHEDULED_TASK_NO_COMMAND');
    }
    await restart();
    expect(await readTask()).toEqual(before);
  });

  it('persists edits and repeats, rejects invalid cron/timezone and cross-organization access', async () => {
    const path = `/projects/${projectId}/scheduled-tasks`;
    const patch = { name: 'Changed schedule', command: 'printf changed-proof', cron: '0 12 * * *' };

    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await request('PATCH', `${path}/${taskId}`, patch)).status).toBe(200);
    }

    const before = await readTask();
    expect((await request('GET', path, undefined, 1)).status).toBe(404);
    expect((await request('POST', path, config, 1)).status).toBe(404);
    expect((await request('PATCH', `${path}/${taskId}`, { name: 'Foreign' }, 1)).status).toBe(404);
    expect((await request('DELETE', `${path}/${taskId}`, undefined, 1)).status).toBe(404);
    expect((await request('PATCH', `${path}/${taskId}`, { name: 'Invalid cron', cron: 'invalid' })).status).toBe(400);
    expect(
      (await request('PATCH', `${path}/${taskId}`, { name: 'Invalid timezone', timezone: 'Invalid/Zone' })).status,
    ).toBe(400);
    await restart();
    expect(await readTask()).toEqual(before);
    expect(await readTask()).toMatchObject(patch);
  });

  it('persists enable/disable and preserves the next run when only renaming', async () => {
    const path = `/projects/${projectId}/scheduled-tasks/${taskId}`;
    expect((await request('PATCH', path, { enabled: true })).status).toBe(200);

    const enabledTask = await readTask();
    expect(enabledTask.enabled).toBe(true);
    expect(Date.parse(enabledTask.nextRunAt!)).toBeGreaterThan(Date.now());

    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await request('PATCH', path, { name: 'Renamed while enabled' })).status).toBe(200);
    }
    await restart();
    expect(await readTask()).toMatchObject({
      name: 'Renamed while enabled',
      enabled: true,
      nextRunAt: enabledTask.nextRunAt,
    });
    expect((await request('PATCH', path, { enabled: false })).status).toBe(200);
    await restart();
    expect(await readTask()).toMatchObject({ enabled: false, nextRunAt: null });
    expect(await store.prisma.scheduledTaskRun.count({ where: { taskId } })).toBe(0);
  });

  it('deletes persistently and refuses repeated deletion', async () => {
    const path = `/projects/${projectId}/scheduled-tasks`;
    expect((await request('DELETE', `${path}/${taskId}`)).status).toBe(204);
    await restart();

    const repeated = await request('DELETE', `${path}/${taskId}`);
    expect(repeated.status).toBe(404);
    expect(repeated.body.code).toBe('SCHEDULED_TASK_NOT_FOUND');

    const observed = await request('GET', path);
    expect(observed.status).toBe(200);
    expect(observed.body.tasks).toEqual([]);
    expect(await store.prisma.scheduledTask.count({ where: { projectId } })).toBe(0);
    expect(await store.prisma.scheduledTaskRun.count({ where: { projectId } })).toBe(0);
  });
});
