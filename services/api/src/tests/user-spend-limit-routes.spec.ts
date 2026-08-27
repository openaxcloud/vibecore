import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const prevCredits = process.env.BILLING_CREDITS_ENABLED;
const prevInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;
const INTERNAL_SECRET = 'canonical-ai-route-test-secret-2026-08-27';
afterEach(() => {
  if (prevCredits === undefined) {
    delete process.env.BILLING_CREDITS_ENABLED;
  } else {
    process.env.BILLING_CREDITS_ENABLED = prevCredits;
  }
  if (prevInternalSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = prevInternalSecret;
  }
});

async function setup() {
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'member@example.com',
    name: 'Member',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Ent Org', slug: 'ent-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'usl-token', expiresAt: new Date(Date.now() + 3600_000) });
  await store.upsertBillingPlan({
    key: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 0,
    limits: { 'ai.messages': 10_000, 'ai.inputTokens': 10_000_000 },
  });
  await store.upsertSubscription({
    organizationId: org.id,
    planKey: 'enterprise',
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2027-08-01T00:00:00.000Z'),
  });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  return { app, store, org, user, project, token: 'usl-token' };
}

const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  'x-vibecore-internal-secret': INTERNAL_SECRET,
});
const quotaPayload = (idempotencyKey: string) => ({
  idempotencyKey,
  requestHash: 'a'.repeat(64),
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-latest',
  estimatedInputTokens: 0,
  estimatedOutputTokens: 1,
  requestedParallelAgents: 1,
});

async function startReservation(input: {
  app: Awaited<ReturnType<typeof setup>>['app'];
  projectId: string;
  token: string;
  reservationId: string;
  requestId: string;
}) {
  const claimed = await input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/execution-claim`,
    headers: auth(input.token),
    payload: {
      userSpendReservationId: input.reservationId,
      requestId: input.requestId,
      claimOwnerId: `${input.requestId}-owner`,
    },
  });
  expect(claimed.statusCode, claimed.body).toBe(200);
  const executionToken = claimed.json().executionToken as string;
  const started = await input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/provider-started`,
    headers: auth(input.token),
    payload: { userSpendReservationId: input.reservationId, requestId: input.requestId, executionToken },
  });
  expect(started.statusCode, started.body).toBe(200);
  return executionToken;
}

function usagePayload(reservationId: string, requestId: string, executionToken: string) {
  return {
    requestId,
    executionToken,
    userSpendReservationId: reservationId,
    calls: [
      {
        callId: 'main',
        kind: 'main',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        inputTokens: 0,
        outputTokens: 1,
      },
    ],
  };
}

describe('Per-user (Enterprise) spend limits', () => {
  it('rejects direct browser access to every canonical mutation and creates no hold, cost, or metric', async () => {
    const { app, store, org, project, token } = await setup();
    const browserHeaders = { authorization: `Bearer ${token}` };
    const mutationPaths = [
      'check-quota',
      'execution-claim',
      'provider-started',
      'platform-usage-started',
      'record-platform-usage',
      'record-usage',
      'provider-metric',
    ];

    for (const path of mutationPaths) {
      const response = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/${path}`,
        headers: browserHeaders,
        payload: {},
      });
      expect(response.statusCode, path).toBe(401);
      expect(response.json().code, path).toBe('INTERNAL_AUTH_REQUIRED');
    }

    expect(store.canonicalUserSpendReservations.size).toBe(0);
    expect(await store.listAiCosts(org.id)).toHaveLength(0);
    expect(store.providerRequestMetrics).toHaveLength(0);

    process.env.INTERNAL_API_SHARED_SECRET = 'x';
    const shortProof = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: { ...browserHeaders, 'x-vibecore-internal-secret': 'x' },
      payload: quotaPayload('short-service-proof'),
    });
    expect(shortProof.statusCode).toBe(401);
    expect(store.canonicalUserSpendReservations.size).toBe(0);

    process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
    const wrongProof = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: { ...browserHeaders, 'x-vibecore-internal-secret': `${INTERNAL_SECRET}-wrong` },
      payload: quotaPayload('wrong-service-proof'),
    });
    expect(wrongProof.statusCode).toBe(401);
    expect(store.canonicalUserSpendReservations.size).toBe(0);

    const serviceAuthorized = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('service-authorized-request'),
    });
    expect(serviceAuthorized.statusCode, serviceAuthorized.body).toBe(200);
    expect(store.canonicalUserSpendReservations.size).toBe(1);
  });

  it('reserves and settles against the canonical ledger, then blocks the next request', async () => {
    const { app, org, user, project, token } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 1 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().limitCents).toBe(1);

    const ok = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('first-request'),
    });
    expect(ok.statusCode, JSON.stringify(ok.json())).toBe(200);
    const reservationId = ok.json().userSpendReservationId as string;
    expect(reservationId).toMatch(/^ledger-reservation_/);
    const requestId = 'first-request';
    const executionToken = await startReservation({
      app,
      projectId: project.id,
      token,
      reservationId,
      requestId,
    });

    const settle = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: auth(token),
      payload: usagePayload(reservationId, requestId, executionToken),
    });
    expect(settle.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('second-request'),
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('USER_SPEND_LIMIT_REACHED');
  });

  it('clearing the limit re-allows the member', async () => {
    const { app, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 1 },
    });
    const reserved = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('held-request'),
    });
    expect(reserved.statusCode).toBe(200);

    const clear = await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: null },
    });
    expect(clear.json().limitCents).toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('after-clear'),
    });
    expect(res.statusCode).toBe(200);
  });

  it('serializes the last cent across concurrent requests with the legacy wallet flag off', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;
    const { app, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 1 },
    });
    const [left, right] = await Promise.all(
      ['concurrent-left', 'concurrent-right'].map((idempotencyKey) =>
        app.inject({
          method: 'POST',
          url: `/projects/${project.id}/ai/check-quota`,
          headers: auth(token),
          payload: quotaPayload(idempotencyKey),
        }),
      ),
    );
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 429]);
    expect([left.json().code, right.json().code]).toContain('USER_SPEND_LIMIT_REACHED');
  });

  it('reserves the entitlement-clamped fan-out plus synthesis before generation starts', async () => {
    const { app, store, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 10 },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: { ...quotaPayload('fan-out-ten'), estimatedOutputTokens: 1_000, requestedParallelAgents: 10 },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe('USER_SPEND_LIMIT_REACHED');
    expect(store.canonicalUserSpendReservations.size).toBe(0);
  });

  it('keeps actual usage durable and idempotent when canonical settlement must be retried', async () => {
    const { app, store, org, user, project, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 1 },
    });
    const authorized = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('settlement-retry'),
    });
    const reservationId = authorized.json().userSpendReservationId as string;
    const requestId = 'settlement-retry';
    const executionToken = await startReservation({
      app,
      projectId: project.id,
      token,
      reservationId,
      requestId,
    });
    const payload = usagePayload(reservationId, requestId, executionToken);

    store.failCanonicalUserSpendCommits = true;
    const failed = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: auth(token),
      payload,
    });
    expect(failed.statusCode).toBe(503);
    expect(await store.listAiCosts(org.id)).toHaveLength(1);
    expect(store.canonicalUserSpendReservations.get(reservationId)?.status).toBe('ACTIVE');

    store.failCanonicalUserSpendCommits = false;
    const retry = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: auth(token),
      payload,
    });
    expect(retry.statusCode).toBe(200);
    expect(await store.listAiCosts(org.id)).toHaveLength(1);
    expect(store.canonicalUserSpendReservations.get(reservationId)?.status).toBe('COMMITTED');
  });

  it('lists member limits + members for the admin UI', async () => {
    const { app, org, user, token } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 500 },
    });
    const res = await app.inject({ method: 'GET', url: `/orgs/${org.id}/usage/limits`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limits).toHaveLength(1);
    expect(body.limits[0]).toMatchObject({ userId: user.id, limitCents: 500 });
    expect(body.members.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects configuration on non-Enterprise plans', async () => {
    const { app, store, org, user, token } = await setup();
    await store.upsertBillingPlan({ key: 'core', name: 'Core', monthlyCents: 2_500, limits: {} });
    await store.upsertSubscription({ organizationId: org.id, planKey: 'core', status: 'ACTIVE' });

    const response = await app.inject({
      method: 'PUT',
      url: `/orgs/${org.id}/usage/limits/${user.id}`,
      headers: auth(token),
      payload: { limitCents: 10 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('USER_SPEND_LIMIT_ENTERPRISE_REQUIRED');
  });
});

describe('canonical AI reconciliation candidate fairness', () => {
  const databaseNowMs = Date.parse('2026-08-27T12:00:00.000Z');

  function reservation(
    index: number,
    overrides: Partial<Parameters<TestApiStore['canonicalUserSpendReservations']['set']>[1]> = {},
  ): Parameters<TestApiStore['canonicalUserSpendReservations']['set']>[1] {
    return {
      id: `fair-reservation-${index}`,
      organizationId: `fair-org-${index}`,
      userId: `fair-user-${index}`,
      idempotencyKey: `fair-key-${index}`,
      requestHash: `fair-hash-${index}`,
      maxAmountCents: 3,
      expiresAt: new Date(databaseNowMs + 60 * 60_000).toISOString(),
      periodStart: '2026-08-01T00:00:00.000Z',
      status: 'ACTIVE',
      ...overrides,
    };
  }

  function dueReservation(index: number) {
    return reservation(index, {
      startedAt: new Date(databaseNowMs - 10 * 60_000).toISOString(),
      settleAfter: new Date(databaseNowMs - 5 * 60_000).toISOString(),
      startedRequestId: `fair-request-${index}`,
      startedRequestHash: `fair-start-hash-${index}`,
      startedProjectId: `fair-project-${index}`,
    });
  }

  it('does not let more than 100 healthy COMMITTED receipts hide a due STARTED run', async () => {
    const store = new TestApiStore();
    store.databaseClockNowMs = databaseNowMs;

    for (let index = 0; index < 101; index += 1) {
      store.canonicalUserSpendReservations.set(
        `healthy-${index}`,
        reservation(index, {
          id: `healthy-${index}`,
          status: 'COMMITTED',
          committedCents: 1,
          startedAt: new Date(databaseNowMs - 60_000).toISOString(),
          settleAfter: new Date(databaseNowMs - 30_000).toISOString(),
          startedRequestId: `healthy-request-${index}`,
          startedProjectId: `healthy-project-${index}`,
          batchRequestHash: `healthy-batch-${index}`,
        }),
      );
    }
    store.canonicalUserSpendReservations.set('healthy-due', dueReservation(1_000));

    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 1,
      settled: 1,
      reservationIds: ['fair-reservation-1000'],
    });
  });

  it('does not let more than 100 abandoned CLAIMED runs hide a due STARTED run', async () => {
    const store = new TestApiStore();
    store.databaseClockNowMs = databaseNowMs;

    for (let index = 0; index < 101; index += 1) {
      store.canonicalUserSpendReservations.set(
        `claimed-${index}`,
        reservation(index, {
          id: `claimed-${index}`,
          claimedAt: new Date(databaseNowMs - 60 * 60_000).toISOString(),
          claimOwnerId: `owner-${index}`,
          claimLeaseExpiresAt: new Date(databaseNowMs - 30 * 60_000).toISOString(),
          executionToken: `execution-${index}`,
          startedRequestHash: `claimed-hash-${index}`,
          startedRequestId: `claimed-request-${index}`,
          startedProjectId: `claimed-project-${index}`,
        }),
      );
    }
    store.canonicalUserSpendReservations.set('claimed-due', dueReservation(2_000));

    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 1,
      settled: 1,
      reservationIds: ['fair-reservation-2000'],
    });
  });

  it('does not let more than 100 future STARTED deadlines hide an earlier platform/user deadline', async () => {
    const store = new TestApiStore();
    store.databaseClockNowMs = databaseNowMs;

    for (let index = 0; index < 101; index += 1) {
      store.canonicalUserSpendReservations.set(
        `future-${index}`,
        reservation(index, {
          id: `future-${index}`,
          startedAt: new Date(databaseNowMs - 60_000).toISOString(),
          settleAfter: new Date(databaseNowMs + 2 * 60 * 60_000).toISOString(),
          startedRequestId: `future-request-${index}`,
          startedProjectId: `future-project-${index}`,
        }),
      );
    }
    store.canonicalUserSpendReservations.set('future-due', dueReservation(3_000));

    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 1,
      settled: 1,
      reservationIds: ['fair-reservation-3000'],
    });
  });

  it('quarantines more than 100 poison receipts durably, then reaches the valid due run', async () => {
    const store = new TestApiStore();
    store.databaseClockNowMs = databaseNowMs;

    for (let index = 0; index < 101; index += 1) {
      store.canonicalUserSpendReservations.set(
        `poison-${index}`,
        reservation(index, {
          id: `poison-${index}`,
          startedAt: new Date(databaseNowMs - 60_000).toISOString(),
          settleAfter: 'not-a-database-deadline',
          startedRequestId: `poison-request-${index}`,
          startedProjectId: `poison-project-${index}`,
        }),
      );
    }
    store.canonicalUserSpendReservations.set('poison-due', dueReservation(4_000));

    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 100,
      manualRecovery: 100,
      settled: 0,
    });
    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 2,
      manualRecovery: 1,
      settled: 1,
      reservationIds: ['fair-reservation-4000'],
    });
    expect(
      [...store.canonicalUserSpendReservations.values()].filter((candidate) => candidate.manualRecoveryAt),
    ).toHaveLength(101);
  });

  it('backs off a transient settlement failure and settles on the next DB-clock attempt', async () => {
    const store = new TestApiStore();
    store.databaseClockNowMs = databaseNowMs;
    store.failCanonicalReconciliationOnce = true;
    const due = dueReservation(5_000);
    store.canonicalUserSpendReservations.set(due.id, due);

    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 1,
      settled: 0,
      manualRecovery: 0,
      retryableFailures: 1,
    });
    expect(store.canonicalUserSpendReservations.get(due.id)).toMatchObject({
      status: 'ACTIVE',
      reconcileFailureAttempts: 1,
    });
    expect(store.canonicalUserSpendReservations.get(due.id)?.manualRecoveryAt).toBeUndefined();

    store.databaseClockNowMs += 5_000;
    await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
      scanned: 1,
      settled: 1,
      manualRecovery: 0,
      retryableFailures: 0,
      reservationIds: [due.id],
    });
  });
});
