import { KubectlWorkspaceK8sClient } from '@vibecore/k8s-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- This NodeNext contract test exercises the real API quota consumer across service boundaries.
import { decideWorkspaceSlot } from '../../api/src/workspace-slot.js';
import { buildWorkspaceManagerApp } from './app.js';
import { clientDeBaseJoignable } from './base-de-donnees-joignable.js';
import { WorkspaceManager } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';

/*
 * BUG-TEST-DB-HANG-001 — la sonde locale attendait `prisma.$disconnect()` sur
 * son chemin d'ÉCHEC, appel qui ne se dénoue jamais quand la connexion n'a pas
 * abouti. Appelée au niveau MODULE juste en dessous, elle bloquait la collecte
 * du fichier entier.
 */
const canReachDatabase = clientDeBaseJoignable;

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

  for (const scenario of [
    { status: 'STARTING' as const, ageMinutes: 11, decision: 'keep' },
    { status: 'STARTING' as const, ageMinutes: 9, decision: 'keep' },
    { status: 'RUNNING' as const, ageMinutes: 11, decision: 'keep' },
  ]) {
    it(`preserves the database timestamp through HTTP: ${scenario.status}, ${scenario.ageMinutes} minutes, ${scenario.decision}`, async () => {
      const record = await createRecord({ status: scenario.status });
      const now = Date.now();
      const updatedAt = new Date(now - scenario.ageMinutes * 60_000);

      // Only this test's row is backdated. No Kubernetes action is invoked.
      await prisma!.workspaceRuntime.update({
        where: { id: record.id },
        data: {
          createdAt: new Date(now - 2 * 86_400_000),
          lastActiveAt: new Date(now - 86_400_000),
          updatedAt,
        },
      });

      const manager = new WorkspaceManager(
        store,
        new KubectlWorkspaceK8sClient(),
        { publish: async () => undefined },
        'local-test-only',
      );

      const app = buildWorkspaceManagerApp(manager);

      try {
        const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();

        const response = await app.inject({
          method: 'GET',
          url: `/v2/workspaces/${record.id}`,
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        });
        expect(response.statusCode).toBe(200);

        const state = response.json();
        expect(state.updatedAt).toBe(updatedAt.toISOString());
        expect(state.admission).toBeUndefined();

        const legacy = await app.inject({
          method: 'GET',
          url: `/workspaces/${record.id}`,
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        });
        expect(legacy.json().updatedAt).toBeUndefined();
        expect(decideWorkspaceSlot(legacy.json(), { now, deadlineMs: 10 * 60_000 })).toBe(scenario.decision);
      } finally {
        await app.close();
      }
    });
  }

  it('reserves atomically across stores and only one claim/release CAS wins', async () => {
    const id = uniqueId('admission-race');
    createdIds.push(id);

    const input = { workspaceId: id, projectId: uniqueId('project'), orgId: uniqueId('org'), plan: 'free' as const };
    const peer = new PrismaWorkspaceStore(prisma!);
    const [a, b] = await Promise.all([store.reserveAdmission(input), peer.reserveAdmission(input)]);
    expect(a.admission).toEqual(b.admission);

    const outcomes = await Promise.all([
      store.compareAdmission(id, a.admission!, { ...a.admission!, state: 'PROVISIONING' }),
      peer.compareAdmission(id, b.admission!, { ...b.admission!, state: 'RELEASED' }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it('does not accept a late result or claim for a released generation', async () => {
    const id = uniqueId('admission-generation');
    createdIds.push(id);

    const input = { workspaceId: id, projectId: uniqueId('project'), orgId: uniqueId('org'), plan: 'free' as const };
    const first = await store.reserveAdmission(input);
    expect(await store.compareAdmission(id, first.admission!, { ...first.admission!, state: 'RELEASED' })).toBe(true);

    const next = await store.reserveAdmission(input);
    expect(next.admission!.generation).not.toBe(first.admission!.generation);
    expect(
      await store.compareAdmission(
        id,
        first.admission!,
        { ...first.admission!, state: 'ACTIVE' },
        { status: 'RUNNING' },
      ),
    ).toBe(false);
    expect((await store.get(id))?.admission).toEqual(next.admission);
    expect((await store.get(id))?.status).toBe('STARTING');
  });

  it('keeps held admissions even for FAILED runtime rows, scoped by organization', async () => {
    const id = uniqueId('admission-list');
    createdIds.push(id);

    const input = { workspaceId: id, projectId: uniqueId('project'), orgId: uniqueId('org'), plan: 'free' as const };
    const record = await store.reserveAdmission(input);
    await store.compareAdmission(
      id,
      record.admission!,
      { ...record.admission!, state: 'PROVISIONING' },
      { status: 'FAILED' },
    );
    expect((await store.listAdmissions(input.orgId)).map((row) => row.id)).toEqual([id]);
    expect(await store.listAdmissions(uniqueId('other-org'))).toEqual([]);
  });

  it('CAS refuses a GC decision after an activity mutation', async () => {
    const id = uniqueId('admission-activity');
    createdIds.push(id);

    const record = await store.reserveAdmission({
      workspaceId: id,
      projectId: uniqueId('project'),
      orgId: uniqueId('org'),
      plan: 'free',
    });
    await store.update(id, { lastActiveAt: new Date(Date.parse(record.lastActiveAt) + 60_000).toISOString() });
    expect(
      await store.compareAdmission(
        id,
        record.admission!,
        { ...record.admission!, state: 'STOPPING' },
        {},
        { lastActiveAt: record.lastActiveAt },
      ),
    ).toBe(false);
  });

  it('fences results by attempt as well as generation and state', async () => {
    const id = uniqueId('admission-attempt');
    createdIds.push(id);

    const record = await store.reserveAdmission({
      workspaceId: id,
      projectId: uniqueId('project'),
      orgId: uniqueId('org'),
      plan: 'free',
    });

    const first = { ...record.admission!, state: 'PROVISIONING' as const, attemptId: 'attempt-1' };
    const second = { ...first, attemptId: 'attempt-2' };
    expect(await store.compareAdmission(id, record.admission!, first)).toBe(true);
    expect(await store.compareAdmission(id, first, second)).toBe(true);
    expect(await store.compareAdmission(id, first, { ...first, state: 'ACTIVE' })).toBe(false);
    expect((await store.get(id))?.admission).toEqual(second);
  });

  it('adopts a released runtime under an exact previous owner guard', async () => {
    const id = uniqueId('admission-owner');
    createdIds.push(id);

    const input = { workspaceId: id, projectId: uniqueId('project'), orgId: uniqueId('org'), plan: 'free' as const };
    const record = await store.reserveAdmission(input);
    const released = { ...record.admission!, state: 'RELEASED' as const };
    expect(await store.compareAdmission(id, record.admission!, released)).toBe(true);
    expect(
      await store.compareAdmission(
        id,
        released,
        record.admission!,
        {},
        { orgId: 'incorrect-owner', projectId: input.projectId },
      ),
    ).toBe(false);

    const adopted = await store.reserveAdmission({ ...input, orgId: uniqueId('new-org') });
    expect(adopted.orgId).not.toBe(input.orgId);
    expect(adopted.admission?.generation).not.toBe(record.admission?.generation);
    expect(await store.listAdmissions(input.orgId)).toEqual([]);
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

    const statuses = after.filter((r) => [w1.id, w2.id, w3.id].includes(r.id)).map((r) => r.status);
    expect(statuses).toEqual(['RUNNING', 'STOPPED', 'DELETED']);
  });
});
