import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';

import { PrismaWorkspaceStore } from './prisma-store.js';

async function canReachDatabase(): Promise<DatabaseClient | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const prisma = createDatabaseClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch {
    await prisma.$disconnect();
    return undefined;
  }
}

const prisma = await canReachDatabase();
const integrationDescribe = prisma ? describe : describe.skip;

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

integrationDescribe('PrismaWorkspaceStore', () => {
  let store: PrismaWorkspaceStore;
  const createdIds: string[] = [];

  beforeEach(() => {
    store = new PrismaWorkspaceStore(prisma!);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    if (createdIds.length > 0) {
      // Clean up the WorkspaceRuntime rows we created, leaving the table
      // tidy for whichever test run comes next.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).workspaceRuntime.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.$disconnect();
  });

  async function createRecord(overrides: Partial<Parameters<PrismaWorkspaceStore['create']>[0]> = {}) {
    const id = overrides.id ?? uniqueId('ws');
    createdIds.push(id);
    return store.create({
      id,
      orgId: overrides.orgId ?? uniqueId('org'),
      projectId: overrides.projectId ?? uniqueId('proj'),
      plan: overrides.plan ?? 'free',
      status: overrides.status ?? 'STARTING',
      pvcName: overrides.pvcName ?? `pvc-${id}`,
      podName: overrides.podName ?? `workspace-${id}`,
      serviceName: overrides.serviceName ?? `workspace-${id}`,
      agentTokenSecretName: overrides.agentTokenSecretName ?? `agent-token-${id}`,
      ...overrides,
    });
  }

  it('round-trips a record through create + get', async () => {
    const created = await createRecord({ plan: 'pro' });
    const fetched = await store.get(created.id);

    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.plan).toBe('pro');
    expect(fetched?.status).toBe('STARTING');
    expect(fetched?.pvcName).toBe(`pvc-${created.id}`);
    expect(fetched?.createdAt).toBe(created.createdAt);
    expect(fetched?.lastActiveAt).toBe(created.lastActiveAt);
    expect(fetched?.error).toBeUndefined();
  });

  it('returns undefined for a missing id', async () => {
    const missing = await store.get('ws-does-not-exist');
    expect(missing).toBeUndefined();
  });

  it('applies a partial patch via update and updates lastActiveAt only when set', async () => {
    const created = await createRecord();
    const afterStatus = await store.update(created.id, { status: 'RUNNING' });
    expect(afterStatus.status).toBe('RUNNING');
    // lastActiveAt unchanged when not in patch
    expect(afterStatus.lastActiveAt).toBe(created.lastActiveAt);

    const newTimestamp = new Date(Date.now() + 60_000).toISOString();
    const afterTouch = await store.update(created.id, { lastActiveAt: newTimestamp });
    expect(afterTouch.lastActiveAt).toBe(newTimestamp);
    expect(afterTouch.status).toBe('RUNNING');
  });

  it('allows the error field to be set and explicitly cleared', async () => {
    const created = await createRecord();
    const failed = await store.update(created.id, { status: 'FAILED', error: 'image pull backoff' });
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toBe('image pull backoff');

    const cleared = await store.update(created.id, { status: 'STARTING', error: undefined });
    // Spec contract: when caller passes `error: undefined`, the field is cleared.
    expect(cleared.status).toBe('STARTING');
    expect(cleared.error).toBeUndefined();
  });

  it('atomically lets only one lifecycle owner claim an observed row', async () => {
    const created = await createRecord({ status: 'RUNNING' });
    const expected = { status: created.status, lastActiveAt: created.lastActiveAt };

    const [stop, reopen] = await Promise.all([
      store.updateIfUnchanged(created.id, expected, { status: 'STOPPING' }),
      store.updateIfUnchanged(created.id, expected, {
        status: 'STARTING',
        lastActiveAt: new Date(Date.now() + 1_000).toISOString(),
      }),
    ]);

    expect([stop, reopen].filter(Boolean)).toHaveLength(1);
    expect((await store.get(created.id))?.status).toBe(stop ? 'STOPPING' : 'STARTING');
  });

  it('throws "Workspace not found" when updating an unknown id (matches JsonWorkspaceStore)', async () => {
    await expect(() => store.update('ws-never-created', { status: 'STOPPED' })).rejects.toThrowError(
      /Workspace not found/,
    );
  });

  it('rejects duplicate creates on the same id (DB primary key)', async () => {
    const created = await createRecord();
    await expect(() => createRecord({ id: created.id })).rejects.toThrow();
  });

  it('lists records in createdAt-ascending order and includes every state', async () => {
    const before = await store.list();
    const beforeIds = new Set(before.map((r) => r.id));

    const w1 = await createRecord({ status: 'RUNNING' });
    await new Promise((r) => setTimeout(r, 5));
    const w2 = await createRecord({ status: 'STOPPED' });
    await new Promise((r) => setTimeout(r, 5));
    const w3 = await createRecord({ status: 'DELETED' });

    const after = await store.list();
    const newIds = after.filter((r) => !beforeIds.has(r.id)).map((r) => r.id);

    // The three new ids appear in the order we inserted them.
    expect(newIds).toEqual([w1.id, w2.id, w3.id]);
    const statuses = after
      .filter((r) => [w1.id, w2.id, w3.id].includes(r.id))
      .map((r) => r.status);
    expect(statuses).toEqual(['RUNNING', 'STOPPED', 'DELETED']);
  });
});
