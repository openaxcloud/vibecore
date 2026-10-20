/**
 * Real Fastify + Prisma authorization fixture for the isolated physical drill.
 * Synthetic identity/session/plan metadata only. No checkout or provider call.
 * The parent harness owns the control database and the coordinator lifecycle.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { DatabaseClient } from '@vibecore/database';
import { buildApiApp } from '../../services/api/src/app.js';
import type { DatabaseRestoreCoordinator } from '../../services/api/src/database-restore-executor.js';
import { PrismaApiStore } from '../../services/api/src/prisma-store.js';

export async function createDatabaseRestoreApiFixture(input: {
  prisma: DatabaseClient;
  coordinator: DatabaseRestoreCoordinator;
  projectId: string;
  organizationId: string;
}) {
  const control = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(control.hostname, '127.0.0.1');
  assert.notEqual(control.port, '55439');
  assert.equal(control.pathname, '/restore_control');
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.equal(process.env.DB_ROLLBACK_ENABLED, 'true');
  assert.ok(!process.env.REDIS_URL && !process.env.WORKSPACE_MANAGER_URL && !process.env.STRIPE_SECRET_KEY);

  const project = await input.prisma.project.findUniqueOrThrow({ where: { id: input.projectId } });
  assert.equal(project.organizationId, input.organizationId);
  assert.match(project.slug, /^vc-restore-qa-/);

  const store = new PrismaApiStore(input.prisma);
  const token = randomBytes(32).toString('hex');

  const user = await store.createUser({
    email: `restore-${randomBytes(8).toString('hex')}@example.invalid`,
    name: 'Isolated physical restore QA',

    // No password login exists for this synthetic session-only identity.
    passwordHash: 'disabled-physical-restore-qa-login',
  });

  const originalFetch = globalThis.fetch;

  let blockedOutboundRequests = 0;

  globalThis.fetch = (request, init) => {
    const url = new URL(request instanceof Request ? request.url : String(request));

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
      blockedOutboundRequests += 1;
      return Promise.reject(new Error('QA_EXTERNAL_HTTP_FORBIDDEN'));
    }

    return originalFetch(request, init);
  };

  let app: Awaited<ReturnType<typeof buildApiApp>> | undefined;

  try {
    await store.updateUser({ userId: user.id, emailVerifiedAt: new Date().toISOString() });
    await store.addMember({ organizationId: input.organizationId, userId: user.id, roleKey: 'owner' });
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 30 * 60_000) });
    await store.upsertSubscription({ organizationId: input.organizationId, planKey: 'team', status: 'ACTIVE' });
    app = await buildApiApp({
      store,
      databaseRestoreCoordinator: input.coordinator,
      emailProvider: {
        async send() {
          throw new Error('QA_EMAIL_FORBIDDEN');
        },
      },
    });

    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const ownedApp = app;

    return {
      app: ownedApp,
      origin,

      // Internal test handle: never serialize or log these headers.
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      async close() {
        try {
          await ownedApp.close();
          await input.prisma.user.delete({ where: { id: user.id } });
        } finally {
          globalThis.fetch = originalFetch;
        }
        assert.equal(blockedOutboundRequests, 0, 'QA attempted an external request');
      },
    };
  } catch (error) {
    try {
      await app?.close();
      await input.prisma.user.delete({ where: { id: user.id } });
    } finally {
      globalThis.fetch = originalFetch;
    }
    throw error;
  }
}
