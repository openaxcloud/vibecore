import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- This NodeNext service test exercises its production Prisma store, not the web-app ~/ alias.
import { PrismaApiStore } from '../prisma-store.js';
import { baseDeDonneesJoignable } from './base-de-donnees-joignable.js';

/*
 * Real PostgreSQL transactions and two independent API stores. These tests do
 * not call Kubernetes, a manager, or any payment service. Each fixture owns its
 * two organizations; cleanup only deletes those exact generated identifiers.
 * Without an explicit reachable DATABASE_URL the entire suite is skipped.
 */
const runDatabaseTests = (await baseDeDonneesJoignable()) ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function barrier() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

async function fixture() {
  const dbA = createDatabaseClient({ poolMax: 1 });
  const dbB = createDatabaseClient({ poolMax: 1 });
  const observer = createDatabaseClient({ poolMax: 1 });
  cleanups.push(
    () => dbA.$disconnect(),
    () => dbB.$disconnect(),
    () => observer.$disconnect(),
  );

  const prefix = `admission-transfer-${randomUUID()}`;
  const source = await dbA.organization.create({ data: { name: `${prefix}-source`, slug: `${prefix}-source` } });
  const target = await dbA.organization.create({ data: { name: `${prefix}-target`, slug: `${prefix}-target` } });
  cleanups.push(() => dbA.organization.deleteMany({ where: { id: { in: [source.id, target.id] } } }));

  const project = await dbA.project.create({ data: { name: prefix, slug: prefix, organizationId: source.id } });

  const workspace = await dbA.workspace.create({
    data: { projectId: project.id, name: prefix, status: 'STOPPED', runtimeMode: 'remote-kubernetes' },
  });

  return {
    dbA,
    dbB,
    observer,
    source,
    target,
    project,
    workspace,
    storeA: new PrismaApiStore(dbA),
    storeB: new PrismaApiStore(dbB),
    transfer: {
      projectId: project.id,
      targetOrganizationId: target.id,
      expectedSourceOrganizationId: source.id,
    },
  };
}

async function backendPid(database: DatabaseClient) {
  const [backend] = await database.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
  return backend.pid;
}

async function transactionState(observer: DatabaseClient, pid: number) {
  const [activity] = await observer.$queryRaw<Array<{ waiting: boolean; transactionOpen: boolean }>>`
    SELECT wait_event_type = 'Lock' AS waiting, xact_start IS NOT NULL AS "transactionOpen"
    FROM pg_stat_activity WHERE pid = ${pid}
  `;
  return activity;
}

runDatabaseTests('workspace admission and project transfer — real PostgreSQL', () => {
  it('refuses a transfer while a committed reserve request is pending, even if UI status changes', async () => {
    const context = await fixture();
    const requestId = randomUUID();
    await context.storeA.beginWorkspaceAdmissionRequest(context.workspace.id, requestId, context.source.id);
    await context.storeB.updateWorkspaceStatus({ workspaceId: context.workspace.id, status: 'FAILED' });

    let validations = 0;

    await expect(
      context.storeB.transferProject({
        ...context.transfer,
        validateRuntimeOwnership: async () => {
          validations += 1;
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PROJECT_TRANSFER_RUNTIME_UNCONFIRMED' });

    expect(validations).toBe(0);
    expect((await context.storeA.getProject(context.project.id))?.organizationId).toBe(context.source.id);
    expect((await context.storeB.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([requestId]);
  });

  it('removes only the confirmed request while another replica retains its own pending request', async () => {
    const context = await fixture();
    const first = randomUUID();
    const second = randomUUID();
    await Promise.all([
      context.storeA.beginWorkspaceAdmissionRequest(context.workspace.id, first, context.source.id),
      context.storeB.beginWorkspaceAdmissionRequest(context.workspace.id, second, context.source.id),
    ]);
    expect(new Set((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests)).toEqual(
      new Set([first, second]),
    );

    await context.storeA.completeWorkspaceAdmissionRequest(context.workspace.id, first);
    await context.storeA.completeWorkspaceAdmissionRequest(context.workspace.id, first);
    expect((await context.storeB.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([second]);
    await expect(context.storeA.transferProject(context.transfer)).rejects.toMatchObject({
      code: 'PROJECT_TRANSFER_RUNTIME_UNCONFIRMED',
    });

    await context.storeB.completeWorkspaceAdmissionRequest(context.workspace.id, second);
    expect((await context.storeA.transferProject(context.transfer)).organizationId).toBe(context.target.id);
  });

  it('blocks a stale admission behind the transfer row lock, then refuses it after ownership changes', async () => {
    const context = await fixture();
    const pid = await backendPid(context.dbB);
    const validating = barrier();
    const finishValidation = barrier();

    const transfer = context.storeA.transferProject({
      ...context.transfer,
      validateRuntimeOwnership: async () => {
        validating.resolve();
        await finishValidation.promise;
      },
    });

    /*
     * Attach both outcome handlers immediately: a regression must fail assertions,
     * not leak an unhandled rejection while another operation is still paused.
     */
    const transferOutcome = transfer.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await Promise.race([
      validating.promise,
      transfer.then(() => {
        throw new Error('Transfer completed without the required ownership validation');
      }),
    ]);

    let managerPosts = 0;

    const staleAdmission = context.storeB
      .beginWorkspaceAdmissionRequest(context.workspace.id, randomUUID(), context.source.id)
      .then(() => {
        managerPosts += 1; // This is the point where production may send reserve.
      });
    const admissionOutcome = staleAdmission.then(
      () => ({ ok: true }),
      (error: unknown) => ({ error }),
    );

    try {
      await expect.poll(async () => (await transactionState(context.observer, pid))?.waiting).toBe(true);
      expect(managerPosts).toBe(0);
    } finally {
      finishValidation.resolve();
    }

    expect(await transferOutcome).toMatchObject({ value: { organizationId: context.target.id } });
    expect(await admissionOutcome).toMatchObject({ error: { statusCode: 409, code: 'WORKSPACE_PROJECT_MISMATCH' } });
    expect(managerPosts).toBe(0);
    expect((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([]);
    expect((await context.storeB.getProject(context.project.id))?.organizationId).toBe(context.target.id);
  });

  it('rejects an admission whose ownership was already transferred before the append begins', async () => {
    const context = await fixture();
    await context.storeA.transferProject(context.transfer);
    await expect(
      context.storeB.beginWorkspaceAdmissionRequest(context.workspace.id, randomUUID(), context.source.id),
    ).rejects.toMatchObject({ statusCode: 409, code: 'WORKSPACE_PROJECT_MISMATCH' });
    expect((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([]);

    const targetRequest = randomUUID();
    await context.storeB.beginWorkspaceAdmissionRequest(context.workspace.id, targetRequest, context.target.id);
    expect((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([
      targetRequest,
    ]);
  });

  it('rejects stale transfer authorization before running the external ownership validation', async () => {
    const context = await fixture();
    await context.storeA.transferProject(context.transfer);

    let validations = 0;
    await expect(
      context.storeB.transferProject({
        ...context.transfer,
        validateRuntimeOwnership: async () => {
          validations += 1;
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'WORKSPACE_PROJECT_MISMATCH' });
    expect(validations).toBe(0);
    expect((await context.storeA.getProject(context.project.id))?.organizationId).toBe(context.target.id);
  });

  it('does not close a project while an admission request is still pending', async () => {
    const context = await fixture();
    const requestId = randomUUID();
    await context.storeA.beginWorkspaceAdmissionRequest(context.workspace.id, requestId, context.source.id);

    await expect(context.storeB.prepareProjectDeletion(context.project.id, context.source.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_TRANSFER_RUNTIME_UNCONFIRMED',
    });

    const project = await context.dbA.project.findUniqueOrThrow({ where: { id: context.project.id } });
    expect(project.deletedAt).toBeNull();
    expect(project.runtimeDeletionPending).toBe(false);
    expect((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([requestId]);
  });

  it('a committed deletion closure refuses reserve, restore, and transfer while keeping resource handles', async () => {
    const context = await fixture();
    const prepared = await context.storeA.prepareProjectDeletion(context.project.id, context.source.id);
    expect(prepared.deletedAt).toBeTruthy();
    expect(prepared.runtimeDeletionPending).toBe(true);

    await expect(
      context.storeB.beginWorkspaceAdmissionRequest(context.workspace.id, randomUUID(), context.source.id),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PROJECT_DELETION_PENDING' });
    await expect(context.storeB.restoreProject(context.project.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_DELETION_PENDING',
    });
    await expect(context.storeB.transferProject(context.transfer)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_DELETION_PENDING',
    });

    const project = await context.dbA.project.findUniqueOrThrow({ where: { id: context.project.id } });
    expect(project).toMatchObject({ organizationId: context.source.id, runtimeDeletionPending: true });
    expect(project.deletedAt).not.toBeNull();
    expect(await context.storeA.getWorkspace(context.workspace.id)).toMatchObject({
      projectId: context.project.id,
      runtimeAdmissionRequests: [],
    });
  });

  it('retrying deletion preparation keeps the project closed and preserves its workspace handles', async () => {
    const context = await fixture();
    await context.storeA.prepareProjectDeletion(context.project.id, context.source.id);

    const retry = await context.storeB.prepareProjectDeletion(context.project.id, context.source.id);

    expect(retry).toMatchObject({
      id: context.project.id,
      organizationId: context.source.id,
      runtimeDeletionPending: true,
    });
    expect(retry.deletedAt).toBeTruthy();
    expect((await context.storeB.listWorkspaces(context.project.id)).map((workspace) => workspace.id)).toEqual([
      context.workspace.id,
    ]);
    await expect(context.storeA.restoreProject(context.project.id)).rejects.toMatchObject({
      code: 'PROJECT_DELETION_PENDING',
    });
  });

  it('serializes a competing closure and admission on the actual Project row, allowing only one to commit', async () => {
    const context = await fixture();
    const blocker = createDatabaseClient({ poolMax: 1 });
    cleanups.push(() => blocker.$disconnect());

    const pidA = await backendPid(context.dbA);
    const pidB = await backendPid(context.dbB);
    const locked = barrier();
    const unlock = barrier();
    const requestId = randomUUID();

    const heldLock = blocker.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${context.project.id} FOR UPDATE`;
      locked.resolve();
      await unlock.promise;
    });

    const lockOutcome = heldLock.then(
      () => ({ ok: true }),
      (error: unknown) => ({ error }),
    );
    await Promise.race([
      locked.promise,
      heldLock.then(() => {
        throw new Error('The fixture row lock completed before its barrier');
      }),
    ]);

    const closure = context.storeA.prepareProjectDeletion(context.project.id, context.source.id);

    const closureOutcome = closure.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );

    let admissionOutcome: Promise<{ ok: boolean } | { error: unknown }> | undefined;

    try {
      await expect.poll(async () => (await transactionState(context.observer, pidA))?.waiting).toBe(true);

      const admission = context.storeB.beginWorkspaceAdmissionRequest(
        context.workspace.id,
        requestId,
        context.source.id,
      );
      admissionOutcome = admission.then(
        () => ({ ok: true }),
        (error: unknown) => ({ error }),
      );
      await expect.poll(async () => (await transactionState(context.observer, pidB))?.waiting).toBe(true);
    } finally {
      unlock.resolve();
    }

    expect(await lockOutcome).toEqual({ ok: true });

    const [closed, admitted] = await Promise.all([closureOutcome, admissionOutcome]);
    const project = await context.dbA.project.findUniqueOrThrow({ where: { id: context.project.id } });
    const workspace = await context.storeA.getWorkspace(context.workspace.id);

    if ('value' in closed) {
      expect(admitted).toMatchObject({ error: { code: 'PROJECT_DELETION_PENDING' } });
      expect(project.runtimeDeletionPending).toBe(true);
      expect(workspace?.runtimeAdmissionRequests).toEqual([]);
    } else {
      expect(closed).toMatchObject({ error: { code: 'PROJECT_TRANSFER_RUNTIME_UNCONFIRMED' } });
      expect(admitted).toEqual({ ok: true });
      expect(project.runtimeDeletionPending).toBe(false);
      expect(project.deletedAt).toBeNull();
      expect(workspace?.runtimeAdmissionRequests).toEqual([requestId]);
    }
  });

  it('cannot change ownership from a validation callback resumed after its real transaction expired', async () => {
    const context = await fixture();
    const previousTimeout = process.env.DATABASE_TX_TIMEOUT_MS;
    process.env.DATABASE_TX_TIMEOUT_MS = '500';

    let timedDatabase: DatabaseClient;

    try {
      timedDatabase = createDatabaseClient({ poolMax: 1 });
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.DATABASE_TX_TIMEOUT_MS;
      } else {
        process.env.DATABASE_TX_TIMEOUT_MS = previousTimeout;
      }
    }
    cleanups.unshift(() => timedDatabase.$disconnect());

    const timedStore = new PrismaApiStore(timedDatabase);
    const pid = await backendPid(timedDatabase);
    const validating = barrier();
    const finishValidation = barrier();

    const transfer = timedStore.transferProject({
      ...context.transfer,
      validateRuntimeOwnership: async () => {
        validating.resolve();
        await finishValidation.promise;
      },
    });
    const outcome = transfer.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await Promise.race([
      validating.promise,
      transfer.then(() => {
        throw new Error('Transfer completed without the required ownership validation');
      }),
    ]);

    const requestId = randomUUID();

    try {
      expect((await transactionState(context.observer, pid))?.transactionOpen).toBe(true);
      await expect
        .poll(async () => (await transactionState(context.observer, pid))?.transactionOpen, { timeout: 5_000 })
        .toBe(false);

      // The old callback is still paused, but PostgreSQL released its row lock.
      await context.storeB.beginWorkspaceAdmissionRequest(context.workspace.id, requestId, context.source.id);
    } finally {
      finishValidation.resolve();
    }

    expect(await outcome).toMatchObject({ error: { code: 'P2028' } });
    expect((await context.storeA.getProject(context.project.id))?.organizationId).toBe(context.source.id);
    expect((await context.storeA.getWorkspace(context.workspace.id))?.runtimeAdmissionRequests).toEqual([requestId]);
  });
});
