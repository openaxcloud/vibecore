import { createHash } from 'node:crypto';
import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const prevShadow = process.env.BILLING_CREDITS_SHADOW;
const prevInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;
const INTERNAL_SECRET = 'turbo-gating-internal-secret-2026-08-27';

afterEach(() => {
  if (prevShadow === undefined) {
    delete process.env.BILLING_CREDITS_SHADOW;
  } else {
    process.env.BILLING_CREDITS_SHADOW = prevShadow;
  }
  if (prevInternalSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = prevInternalSecret;
  }
});

async function setup() {
  // Shadow mode runs the checkpoint path (records the checkpoint) without debiting.
  process.env.BILLING_CREDITS_SHADOW = 'true';
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'turbo@example.com',
    name: 'Turbo User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Turbo Org', slug: 'turbo-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'turbo-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  return { app, store, org, project, token: 'turbo-token' };
}

async function recordTurbo(app: Awaited<ReturnType<typeof setup>>['app'], projectId: string, token: string) {
  const requestId = `turbo-gating-${projectId}`;
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        requestId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 100,
        outputTokens: 100,
      }),
    )
    .digest('hex');
  const headers = {
    authorization: `Bearer ${token}`,
    'x-vibecore-internal-secret': INTERNAL_SECRET,
  };
  const quota = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/check-quota`,
    headers,
    payload: {
      idempotencyKey: requestId,
      requestHash,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 100,
      requestedParallelAgents: 1,
    },
  });
  expect(quota.statusCode, quota.body).toBe(200);
  const userSpendReservationId = quota.json().userSpendReservationId as string;

  const claim = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/execution-claim`,
    headers,
    payload: {
      userSpendReservationId,
      requestId,
      claimOwnerId: `${requestId}-owner`,
    },
  });
  expect(claim.statusCode, claim.body).toBe(200);
  const executionToken = claim.json().executionToken as string;

  const started = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/provider-started`,
    headers,
    payload: { userSpendReservationId, requestId, executionToken },
  });
  expect(started.statusCode, started.body).toBe(200);

  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/record-usage`,
    headers,
    payload: {
      requestId,
      executionToken,
      userSpendReservationId,
      calls: [
        {
          callId: 'turbo-main',
          kind: 'main',
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 100,
        },
      ],
      buildTier: 'power',
      turboMode: true,
      highPowerModel: true,
    },
  });
}

describe('Turbo / high-power gating at record-usage', () => {
  it('strips turbo + high-power for a free org (no subscription = free)', async () => {
    const { app, store, org, project, token } = await setup();
    const res = await recordTurbo(app, project.id, token);
    expect(res.statusCode).toBe(200);

    const checkpoints = await store.listAgentCheckpoints(org.id, { take: 5 });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].turboMode).toBe(false);
    expect(checkpoints[0].highPowerModel).toBe(false);
    // Build tier (not a premium-gated mode) is preserved.
    expect(checkpoints[0].buildTier).toBe('power');
  });

  it('keeps turbo + high-power for a paid (pro) org', async () => {
    const { app, store, org, project, token } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    const res = await recordTurbo(app, project.id, token);
    expect(res.statusCode).toBe(200);

    const checkpoints = await store.listAgentCheckpoints(org.id, { take: 5 });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].turboMode).toBe(true);
    expect(checkpoints[0].highPowerModel).toBe(true);
  });
});
