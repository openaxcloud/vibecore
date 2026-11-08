import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '@vibecore/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';

/*
 * Opt-in proof against the already migrated, disposable runtime CI database.
 * No cloud connection, schema reset, seeded records or runtime pods are touched.
 */
describe.skipIf(process.env.WORKSPACE_IDE_POSTGRES_PROOF !== '1')('workspace IDE migration on PostgreSQL', () => {
  let first: PrismaApiStore;
  let second: PrismaApiStore;
  let organizationId: string | undefined;
  let projectId: string;
  let secondPid: number;

  beforeAll(async () => {
    expect(process.env.GITHUB_ACTIONS).toBe('true');
    expect(process.env.RUNNER_ENVIRONMENT).toBe('github-hosted');
    expect(process.env.VIBECORE_CI_EPHEMERAL_RUNTIME).toBe('1');
    expect(process.env.NODE_ENV).toBe('test');

    const url = new URL(process.env.DATABASE_URL!);
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.port).toBe('55432');
    expect(url.pathname).toBe('/vibecore');
    expect(url.search).toBe('');
    first = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));
    second = new PrismaApiStore(createDatabaseClient({ poolMax: 1 }));

    const slug = `workspace-ide-proof-${randomUUID()}`;
    organizationId = (await first.prisma.organization.create({ data: { name: slug, slug } })).id;
    projectId = (await first.prisma.project.create({ data: { organizationId, name: slug, slug } })).id;

    const [firstPids, secondPids] = await Promise.all(
      [first, second].map((store) => store.prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`),
    );
    secondPid = secondPids[0].pid;
    expect(firstPids[0].pid).not.toBe(secondPid);
  });

  afterAll(async () => {
    try {
      if (first && organizationId) {
        // Cascades only this random fixture's project/workspaces/IDE states.
        await first.prisma.organization.delete({ where: { id: organizationId } });
      }
    } finally {
      await Promise.all([first?.prisma.$disconnect(), second?.prisma.$disconnect()]);
    }
  });

  async function workspace() {
    return first.prisma.workspace.create({
      data: { projectId, name: 'Synthetic migration proof', runtimeMode: 'remote-kubernetes' },
    });
  }

  it('inserts an absent state at version 1 and never increments or replaces it on repeat', async () => {
    const { id } = await workspace();
    const state = { ui: { agentWidth: 520 } };
    expect(await first.createWorkspaceIdeStateIfAbsent({ workspaceId: id, state })).toMatchObject({
      state,
      version: 1,
    });
    expect(
      await second.createWorkspaceIdeStateIfAbsent({ workspaceId: id, state: { ui: { agentWidth: 700 } } }),
    ).toMatchObject({ state, version: 1 });
    expect(await second.getWorkspaceIdeState(id)).toMatchObject({ state, version: 1 });
  });

  it('returns the same single persisted winner to concurrent initializers', async () => {
    const { id } = await workspace();

    const results = await Promise.all(
      [first, second].map((store, index) =>
        store.createWorkspaceIdeStateIfAbsent({ workspaceId: id, state: { ui: { agentWidth: 520 + index } } }),
      ),
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[0].version).toBe(1);
    expect(await first.prisma.workspaceIdeState.count({ where: { workspaceId: id } })).toBe(1);
  });

  it('waits for a competing writer and preserves its intentionally empty state and version', async () => {
    const { id } = await workspace();

    let migration: ReturnType<PrismaApiStore['createWorkspaceIdeStateIfAbsent']> | undefined;

    try {
      await first.prisma.$transaction(
        async (tx) => {
          await tx.workspaceIdeState.create({ data: { workspaceId: id, state: {}, version: 7 } });
          migration = second.createWorkspaceIdeStateIfAbsent({ workspaceId: id, state: { ui: { agentWidth: 520 } } });

          /*
           * Observe a real lock wait, rather than relying on scheduling or sleeps
           * to claim the migration overlapped the uncommitted competing insert.
           */
          const deadline = Date.now() + 10_000;

          let waiting = false;

          while (!waiting && Date.now() < deadline) {
            await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;

            const rows = await tx.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${secondPid}
          `;
            waiting = rows[0]?.waiting === true;

            if (!waiting) {
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          expect(waiting).toBe(true);
        },
        { timeout: 20_000 },
      );
      expect(await migration).toMatchObject({ state: {}, version: 7 });
      expect(await first.getWorkspaceIdeState(id)).toMatchObject({ state: {}, version: 7 });
      await expect(
        first.upsertWorkspaceIdeState({ workspaceId: id, state: { ui: {} }, expectedVersion: 1 }),
      ).rejects.toMatchObject({ code: 'IDE_STATE_VERSION_CONFLICT' });
      expect(await first.getWorkspaceIdeState(id)).toMatchObject({ state: {}, version: 7 });
    } finally {
      // Settle any blocked insert after transaction rollback/commit before cleanup.
      await migration;
    }
  });
});
