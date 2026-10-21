import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

describe.skipIf(process.env.PANEL_POSTGRES_PROOF !== '1')('enterprise settings with real PostgreSQL and HTTP', () => {
  let store: PrismaApiStore;
  let observer: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;

  const users: string[] = [];
  const organizations: string[] = [];
  const observations: unknown[] = [];

  async function fixture() {
    const suffix = randomUUID();

    const user = await store.createUser({
      email: `${suffix}@example.test`,
      name: 'Synthetic settings proof',
      passwordHash: 'disabled-synthetic-login',
    });
    users.push(user.id);

    const org = await store.createOrganization({
      name: 'Synthetic settings proof',
      slug: suffix,
      ownerUserId: user.id,
    });
    organizations.push(org.id);

    const project = await store.createProject({ organizationId: org.id, name: 'Synthetic project', slug: suffix });
    const token = randomUUID();
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) });
    expect(await store.prisma.enterpriseOrganizationSettings.count({ where: { organizationId: org.id } })).toBe(0);

    return { organizationId: org.id, projectId: project.id, token };
  }

  async function get(projectId: string, token: string, suffix = '') {
    const response = await fetch(`${origin}/projects/${projectId}${suffix}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const body = await response.json();

    return { status: response.status, body };
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
    expect(url.pathname).toBe('/panel_proof');
    expect(process.env.NODE_ENV).toBe('test');
    store = new PrismaApiStore();
    observer = new PrismaApiStore();
    app = await buildApiApp({
      store,
      loggerStream: {
        write() {
          /* Logs are intentionally discarded; proof observations contain no sessions. */
        },
      },
    });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app?.close();

    if (store) {
      await store.prisma.project.deleteMany({ where: { organizationId: { in: organizations } } });
      await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.prisma.$disconnect();
    }

    await observer?.prisma.$disconnect();
    process.stdout.write('ENTERPRISE_PROOF_OBSERVATIONS ' + JSON.stringify(observations) + '\n');
  });

  it('serves both first GETs during concurrent insertion, repeated on three fresh organizations', async () => {
    for (let round = 0; round < 3; round++) {
      const actor = await fixture();

      let unlock!: () => void;
      let locked!: () => void;

      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const lock = observer.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('LOCK TABLE "EnterpriseOrganizationSettings" IN SHARE MODE');
          locked();
          await release;
        },
        { timeout: 20000 },
      );
      await ready;

      const pending = Promise.all([get(actor.projectId, actor.token), get(actor.projectId, actor.token, '/snapshots')]);

      try {
        const deadline = Date.now() + 10000;

        let blocked = 0;

        while (blocked < 2 && Date.now() < deadline) {
          const rows = await store.prisma.$queryRaw<{ query: string }[]>`
            SELECT query FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%INSERT%EnterpriseOrganizationSettings%'
          `;
          blocked = rows.length;

          if (blocked === 2) {
            observations.push({ round, blockedInserts: rows.map((row) => row.query) });
          }
        }
        expect(blocked, 'both actual HTTP prehandlers reached INSERT behind the PostgreSQL lock').toBe(2);
      } finally {
        unlock();
        await lock;
        await pending;
      }

      const responses = await pending;
      observations.push({
        round,
        expectedHttpStatuses: [200, 200],
        observedHttpStatuses: responses.map((response) => response.status),
      });
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(z.object({ project: z.object({ id: z.string() }) }).parse(responses[0].body).project.id).toBe(
        actor.projectId,
      );
      expect(z.object({ snapshots: z.array(z.unknown()) }).parse(responses[1].body).snapshots).toEqual([]);
      expect(
        await store.prisma.enterpriseOrganizationSettings.count({ where: { organizationId: actor.organizationId } }),
      ).toBe(1);

      const fresh = new PrismaApiStore();

      try {
        expect(await fresh.getEnterpriseSettings(actor.organizationId)).toMatchObject({
          organizationId: actor.organizationId,
          ipAllowlist: [],
          requireMfaForAdmins: false,
          dataRetentionDays: 365,
          legalHoldEnabled: false,
        });
      } finally {
        await fresh.prisma.$disconnect();
      }
      expect((await get(actor.projectId, actor.token)).status).toBe(200);
      expect((await get(actor.projectId, actor.token, '/snapshots')).status).toBe(200);
    }
  });

  it('preserves every existing setting and updatedAt across concurrent reads and reconnection', async () => {
    const actor = await fixture();
    await store.updateEnterpriseSettings({
      organizationId: actor.organizationId,
      ipAllowlist: ['127.0.0.1'],
      sessionDurationMinutes: 95,
      requireMfaForAdmins: true,
      dataRetentionDays: 42,
      legalHoldEnabled: true,
      ssoEnforced: true,
      ssoEnforcedAt: '2026-01-01T00:00:00.000Z',
    });

    const original = await store.prisma.enterpriseOrganizationSettings.findUniqueOrThrow({
      where: { organizationId: actor.organizationId },
    });
    await Promise.all([
      store.getEnterpriseSettings(actor.organizationId),
      observer.getEnterpriseSettings(actor.organizationId),
    ]);

    const fresh = new PrismaApiStore();

    try {
      expect(
        await fresh.prisma.enterpriseOrganizationSettings.findUniqueOrThrow({
          where: { organizationId: actor.organizationId },
        }),
      ).toEqual(original);
      observations.push({ existingSettingsIncludingUpdatedAtUnchanged: true, newConnection: true });
    } finally {
      await fresh.prisma.$disconnect();
    }
  });

  it('refuses foreign organization access to a fresh organization without returning project data', async () => {
    const owner = await fixture();
    const foreign = await fixture();

    const replies = await Promise.all([
      get(owner.projectId, foreign.token),
      get(owner.projectId, foreign.token, '/snapshots'),
    ]);
    observations.push({
      freshOrganization: true,
      expectedForeignStatuses: [404, 404],
      observedForeignStatuses: replies.map((reply) => reply.status),
    });
    expect(replies.map((reply) => reply.status)).toEqual([404, 404]);

    for (const reply of replies) {
      expect(reply.body).not.toHaveProperty('project');
      expect(reply.body).not.toHaveProperty('snapshots');
    }

    /*
     * The existing enterprise prehandler runs before membership authorization.
     * Its initial settings creation is unchanged; neither route returns project data.
     */
    expect(
      await store.prisma.enterpriseOrganizationSettings.count({ where: { organizationId: owner.organizationId } }),
    ).toBe(1);
  });

  it('preserves preconfigured owner settings while refusing foreign organization access', async () => {
    const owner = await fixture();
    const foreign = await fixture();
    const original = await store.getEnterpriseSettings(owner.organizationId);

    const replies = await Promise.all([
      get(owner.projectId, foreign.token),
      get(owner.projectId, foreign.token, '/snapshots'),
    ]);
    observations.push({
      expectedForeignStatuses: [404, 404],
      observedForeignStatuses: replies.map((reply) => reply.status),
    });
    expect(replies.map((reply) => reply.status)).toEqual([404, 404]);
    expect(await observer.getEnterpriseSettings(owner.organizationId)).toEqual(original);
    expect(
      await store.prisma.enterpriseOrganizationSettings.count({ where: { organizationId: owner.organizationId } }),
    ).toBe(1);
  });

  it('propagates a real foreign-key failure instead of returning fabricated defaults', async () => {
    const missing = randomUUID();
    await expect(store.getEnterpriseSettings(missing)).rejects.toMatchObject({ code: 'P2003' });
    expect(await store.prisma.enterpriseOrganizationSettings.count({ where: { organizationId: missing } })).toBe(0);
    observations.push({ expectedErrorCode: 'P2003', observedErrorCode: 'P2003', persistedRows: 0 });
  });
});
