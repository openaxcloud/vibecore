import { hashPassword } from '@vibecore/auth';
import { BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetAgentRoutingCache } from '../agent-routing-service.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const INTERNAL_SECRET = 'agent-routing-internal-secret-2026-08-27';
const previousInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;
const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  'x-vibecore-internal-secret': INTERNAL_SECRET,
});

beforeEach(() => {
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
  resetAgentRoutingCache();
});

afterEach(() => {
  if (previousInternalSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = previousInternalSecret;
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'agm@example.com',
    name: 'AGM User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'AGM Org', slug: 'agm-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'agm-token', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'agm-p' });

  const admin = await store.createUser({
    email: 'agm-admin@example.com',
    name: 'AGM Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({
    userId: admin.id,
    token: 'agm-admin-token',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('agm-admin-token'),
    payload: { password: 'password123' },
  });

  return { app, store, org, project, user };
}

let canonicalSequence = 0;
async function recordCanonicalUsage(input: {
  app: Awaited<ReturnType<typeof setup>>['app'];
  projectId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  agentRouting: {
    mode: 'lite' | 'economy' | 'power';
    lineKey: 'lite' | 'economy' | 'power' | 'high-effort' | 'turbo';
    highEffort?: boolean;
    escalated?: boolean;
    turbo?: boolean;
    source?: string;
  };
}) {
  canonicalSequence += 1;
  const requestId = `agent-routing-${canonicalSequence}`;
  const quota = await input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/check-quota`,
    headers: auth('agm-token'),
    payload: {
      idempotencyKey: requestId,
      requestHash: 'a'.repeat(64),
      estimatedInputTokens: input.inputTokens,
      estimatedOutputTokens: input.outputTokens,
      requestedParallelAgents: 1,
    },
  });
  expect(quota.statusCode, quota.body).toBe(200);
  const reservationId = quota.json().userSpendReservationId as string;
  const claim = await input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/execution-claim`,
    headers: auth('agm-token'),
    payload: { userSpendReservationId: reservationId, requestId, claimOwnerId: `${requestId}-owner` },
  });
  expect(claim.statusCode, claim.body).toBe(200);
  const executionToken = claim.json().executionToken as string;
  const started = await input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/provider-started`,
    headers: auth('agm-token'),
    payload: { userSpendReservationId: reservationId, requestId, executionToken },
  });
  expect(started.statusCode, started.body).toBe(200);
  return input.app.inject({
    method: 'POST',
    url: `/projects/${input.projectId}/ai/record-usage`,
    headers: auth('agm-token'),
    payload: {
      requestId,
      executionToken,
      userSpendReservationId: reservationId,
      calls: [
        {
          callId: 'main',
          kind: 'main',
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        },
      ],
      agentRouting: {
        highEffort: false,
        escalated: false,
        turbo: false,
        source: 'chat',
        ...input.agentRouting,
        routingCardVersion: BUILTIN_AGENT_ROUTING_CARD.version,
      },
    },
  });
}

function draftFromBuiltin() {
  return {
    sourceDate: BUILTIN_AGENT_ROUTING_CARD.sourceDate,
    baseUserInCentsPerM: BUILTIN_AGENT_ROUTING_CARD.baseUserInCentsPerM,
    baseUserOutCentsPerM: BUILTIN_AGENT_ROUTING_CARD.baseUserOutCentsPerM,
    lines: structuredClone(BUILTIN_AGENT_ROUTING_CARD.lines),
  };
}

describe('GET /projects/:id/agent/routing (client-safe mode availability)', () => {
  it('returns the three modes with economy default and NEVER leaks a model name', async () => {
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent/routing`,
      headers: auth('agm-token'),
    });

    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.defaultMode).toBe('economy');
    expect(body.modes.map((m: { mode: string }) => m.mode)).toEqual(['lite', 'economy', 'power']);

    // The whole payload must be model-name free — this is the product rule.
    expect(res.body).not.toMatch(/claude|gpt|anthropic|openai|haiku|opus|fable|sol/i);
  });

  it('keeps turbo OFF for a free org even before the org flag exists', async () => {
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent/routing`,
      headers: auth('agm-token'),
    });

    const body = res.json();
    expect(body.turbo.available).toBe(false);
    expect(body.highEffort.available).toBe(false); // free plan: switches locked
  });

  it('unlocks turbo only with BOTH a paid plan and the org feature flag', async () => {
    const { app, store, org, project } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    const before = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent/routing`,
      headers: auth('agm-token'),
    });
    expect(before.json().turbo.available).toBe(false);
    expect(before.json().turbo.planAllowed).toBe(true);
    expect(before.json().highEffort.available).toBe(true);

    await store.setFeatureFlag({ key: 'agent_turbo', enabled: true, organizationId: org.id });

    const after = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent/routing`,
      headers: auth('agm-token'),
    });
    expect(after.json().turbo.available).toBe(true);
  });
});

describe('record-usage AGM per-call log', () => {
  it('writes an AgentCallLog row priced from the routing card, with mode-dependent cost', async () => {
    const { app, store, org, project } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    const record = (lineKey: string, mode: string) =>
      recordCanonicalUsage({
        app,
        projectId: project.id,
        provider: 'anthropic',
        model: 'claude-opus-5',
        inputTokens: 100_000,
        outputTokens: 10_000,
        agentRouting: {
          mode: mode as 'economy' | 'power',
          lineKey: lineKey as 'economy' | 'power',
        },
      });

    expect((await record('economy', 'economy')).statusCode).toBe(200);
    expect((await record('power', 'power')).statusCode).toBe(200);

    const calls = await store.listAgentCalls();
    expect(calls).toHaveLength(2);

    const economy = calls.find((c) => c.lineKey === 'economy')!;
    const power = calls.find((c) => c.lineKey === 'power')!;

    /*
     * (d) the cost DIFFERS by mode: power bills 2x economy (before rounding:
     * economy raw 97.5 -> ceil 98; power raw exactly 195).
     */
    expect(economy.creditCents).toBe(98);
    expect(power.creditCents).toBe(195);
    expect(power.model).toBe('claude-opus-5');
    expect(economy.model).toBe('claude-opus-5');
    expect(economy.costMillicents).toBe(75_000);
    expect(economy.marginMillicents).toBe(98_000 - 75_000);
    expect(economy.routingCardVersion).toBe(BUILTIN_AGENT_ROUTING_CARD.version);
  });

  it('records the classifier as unbilled operating cost', async () => {
    const { app, store, project } = await setup();

    canonicalSequence += 1;
    const requestId = `agent-classifier-${canonicalSequence}`;
    const quota = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth('agm-token'),
      payload: {
        idempotencyKey: requestId,
        requestHash: 'b'.repeat(64),
        estimatedOutputTokens: 1,
        requestedParallelAgents: 1,
      },
    });
    expect(quota.statusCode, quota.body).toBe(200);
    const reservationId = quota.json().userSpendReservationId as string;
    const claim = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/execution-claim`,
      headers: auth('agm-token'),
      payload: { userSpendReservationId: reservationId, requestId, claimOwnerId: `${requestId}-owner` },
    });
    expect(claim.statusCode, claim.body).toBe(200);
    const executionToken = claim.json().executionToken as string;
    const routing = {
      mode: 'economy',
      highEffort: true,
      turbo: false,
      lineKey: 'classifier',
      routingCardVersion: BUILTIN_AGENT_ROUTING_CARD.version,
      source: 'classifier',
    } as const;
    const intent = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/platform-usage-started`,
      headers: auth('agm-token'),
      payload: {
        userSpendReservationId: reservationId,
        requestId,
        executionToken,
        agentRouting: routing,
        call: {
          callId: 'classifier',
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          maxInputTokens: 2_000,
          maxOutputTokens: 50,
        },
      },
    });
    expect(intent.statusCode, intent.body).toBe(200);

    const nextCard = draftFromBuiltin();
    nextCard.lines.find((line) => line.key === 'economy')!.model = 'claude-sonnet-5';
    const published = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: nextCard },
    });
    expect(published.statusCode, published.body).toBe(200);
    expect(published.json().version).toBe(BUILTIN_AGENT_ROUTING_CARD.version + 1);

    const intentReplay = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/platform-usage-started`,
      headers: auth('agm-token'),
      payload: {
        userSpendReservationId: reservationId,
        requestId,
        executionToken,
        agentRouting: routing,
        call: {
          callId: 'classifier',
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          maxInputTokens: 2_000,
          maxOutputTokens: 50,
        },
      },
    });
    expect(intentReplay.statusCode, intentReplay.body).toBe(200);
    expect(intentReplay.json().replayed).toBe(true);
    const platformUsagePayload = {
      userSpendReservationId: reservationId,
      requestId,
      executionToken,
      outcome: 'hard' as const,
      agentRouting: { ...routing, escalated: true },
      call: {
        callId: 'classifier' as const,
        kind: 'classifier' as const,
        billedToUser: false as const,
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        inputTokens: 2_000,
        outputTokens: 50,
      },
    };
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-platform-usage`,
      headers: auth('agm-token'),
      payload: platformUsagePayload,
    });
    expect(res.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-platform-usage`,
      headers: auth('agm-token'),
      payload: platformUsagePayload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replayed).toBe(true);

    const [call] = await store.listAgentCalls();
    expect(await store.listAgentCalls()).toHaveLength(1);
    expect(call.billedToUser).toBe(false);
    expect(call.creditCents).toBe(0);
    expect(call.costMillicents).toBe(225);
    expect(call.source).toBe('classifier');
  });
});

describe('admin agent routing', () => {
  it('serves the table with live margins and 30d volume per line', async () => {
    const { app, store, org, project } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    // Generate one call of volume first.
    await recordCanonicalUsage({
      app,
      projectId: project.id,
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      agentRouting: { mode: 'economy', lineKey: 'economy' },
    });

    const res = await app.inject({ method: 'GET', url: '/admin/agent-routing', headers: auth('agm-admin-token') });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.card.version).toBe(BUILTIN_AGENT_ROUTING_CARD.version);
    expect(body.negativeLines).toEqual([]);

    const economy = body.lines.find((line: { key: string }) => line.key === 'economy');
    expect(economy.model).toBe('claude-opus-5');
    expect(economy.userPrice).toEqual({ inCentsPerM: 650, outCentsPerM: 3250 });
    expect(economy.margins.negative).toBe(false);
    expect(economy.volume30d.calls).toBe(1);
    expect(economy.volume30d.tokensIn).toBe(1_000_000);
  });

  it('refuses the anonymous and non-admin caller', async () => {
    const { app } = await setup();

    expect((await app.inject({ method: 'GET', url: '/admin/agent-routing' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/admin/agent-routing', headers: auth('agm-token') })).statusCode,
    ).toBe(403);
  });

  it('blocks publishing a negative-margin card with 409, then accepts with explicit confirmation', async () => {
    const { app, store } = await setup();

    const draft = draftFromBuiltin();
    draft.lines.find((line) => line.key === 'economy')!.costInCentsPerM = 100_000; // way above price

    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: draft },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('AGENT_ROUTING_NEGATIVE_MARGIN');
    expect(blocked.json().negativeLines).toEqual(['economy']);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: draft, confirmNegativeMargin: true },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().version).toBe(BUILTIN_AGENT_ROUTING_CARD.version + 1); // boot seeds the built-in card first

    const history = await store.listAgentRoutingCards();
    expect(history[0].active).toBe(true);
  });

  it('refuses routing costs that are not exactly representable or exceed the classifier ledger bound', async () => {
    const { app, store } = await setup();
    const before = await store.listAgentRoutingCards();

    const imprecise = draftFromBuiltin();
    imprecise.lines.find((line) => line.key === 'classifier')!.costInCentsPerM = 0.3333;
    const impreciseResponse = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: imprecise },
    });
    expect(impreciseResponse.statusCode, impreciseResponse.body).toBe(400);
    expect(impreciseResponse.json().code).toBe('AGENT_ROUTING_INVALID');

    const unsafe = draftFromBuiltin();
    unsafe.lines.find((line) => line.key === 'classifier')!.costInCentsPerM = Number.MAX_SAFE_INTEGER;
    const unsafeResponse = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: unsafe },
    });
    expect(unsafeResponse.statusCode, unsafeResponse.body).toBe(400);
    expect(await store.listAgentRoutingCards()).toHaveLength(before.length);
  });

  it('publishing a new version changes routing WITHOUT a deployment (config-only)', async () => {
    const { app, project } = await setup();

    const draft = draftFromBuiltin();
    draft.lines.find((line) => line.key === 'economy')!.model = 'claude-sonnet-5';
    draft.lines.find((line) => line.key === 'economy')!.costInCentsPerM = 300;
    draft.lines.find((line) => line.key === 'economy')!.costOutCentsPerM = 1500;

    const published = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing',
      headers: auth('agm-admin-token'),
      payload: { card: draft },
    });
    expect(published.statusCode).toBe(200);

    resetAgentRoutingCache();

    const table = await app.inject({ method: 'GET', url: '/admin/agent-routing', headers: auth('agm-admin-token') });
    expect(table.json().lines.find((line: { key: string }) => line.key === 'economy').model).toBe('claude-sonnet-5');

    // The client-safe surface still leaks nothing after the change.
    const client = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent/routing`,
      headers: auth('agm-token'),
    });
    expect(client.body).not.toMatch(/sonnet|claude/i);
  });

  it('simulates a draft against the last 30 days of real volume', async () => {
    const { app, store, org, project } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    await recordCanonicalUsage({
      app,
      projectId: project.id,
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      agentRouting: { mode: 'economy', lineKey: 'economy' },
    });

    // Draft doubles the base user price.
    const draft = draftFromBuiltin();
    draft.baseUserInCentsPerM = 1300;
    draft.baseUserOutCentsPerM = 6500;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent-routing/simulate',
      headers: auth('agm-admin-token'),
      payload: { card: draft },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    const economy = body.lines.find((line: { lineKey: string }) => line.lineKey === 'economy');

    // actual: credit ceil(650+325)=975; simulated: 1300+650=1950 exactly.
    expect(economy.actualCreditCents).toBe(975);
    expect(economy.simulatedCreditCents).toBeCloseTo(1950, 5);
    expect(economy.simulatedCostCents).toBeCloseTo(750, 5);
    expect(body.totals.simulatedMarginCents).toBeCloseTo(1200, 5);
  });

  it('exposes the per-call admin log with the real model used', async () => {
    const { app, project } = await setup();

    await recordCanonicalUsage({
      app,
      projectId: project.id,
      provider: 'openai',
      model: 'gpt-5.6-sol',
      inputTokens: 10_000,
      outputTokens: 1_000,
      agentRouting: { mode: 'power', lineKey: 'turbo', turbo: true },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/agent-routing/calls?limit=10',
      headers: auth('agm-admin-token'),
    });
    expect(res.statusCode).toBe(200);

    const [call] = res.json().calls;
    expect(call.provider).toBe('openai');
    expect(call.model).toBe('gpt-5.6-sol');
    expect(call.turbo).toBe(true);
    expect(call.lineKey).toBe('turbo');
  });
});

describe('GET /projects/:id/agent/routing/resolve (control-plane decision point)', () => {
  const resolve = (app: Awaited<ReturnType<typeof setup>>['app'], projectId: string, qs: string) =>
    app.inject({
      method: 'GET',
      url: `/projects/${projectId}/agent/routing/resolve${qs}`,
      headers: auth('agm-token'),
    });

  it('resolves each mode to its concrete provider+model from the active card', async () => {
    const { app, project } = await setup();

    const economy = (await resolve(app, project.id, '?mode=economy')).json();
    expect(economy.base).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5', multiplier: 1 });

    const lite = (await resolve(app, project.id, '?mode=lite')).json();
    expect(lite.base).toMatchObject({ model: 'claude-haiku-4-5', multiplier: 0.5 });

    const power = (await resolve(app, project.id, '?mode=power')).json();
    expect(power.base).toMatchObject({ model: 'claude-opus-5', multiplier: 2 });
    expect(power.escalation).toBeUndefined();
  });

  it('refuses high effort on the free plan (403, explicit code) and in Lite mode', async () => {
    const { app, store, org, project } = await setup();

    const freeRefusal = await resolve(app, project.id, '?mode=economy&highEffort=true');
    expect(freeRefusal.statusCode).toBe(403);
    expect(freeRefusal.json().code).toBe('AGENT_HIGH_EFFORT_NOT_ALLOWED');

    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    const liteRefusal = await resolve(app, project.id, '?mode=lite&highEffort=true');
    expect(liteRefusal.statusCode).toBe(403);
    expect(liteRefusal.json().code).toBe('AGENT_HIGH_EFFORT_LITE');

    const granted = await resolve(app, project.id, '?mode=economy&highEffort=true');
    expect(granted.statusCode).toBe(200);
    expect(granted.json().escalation).toMatchObject({ model: 'claude-opus-5', multiplier: 2 });
    expect(granted.json().classifier).toMatchObject({ model: 'claude-haiku-4-5' });
  });

  it('refuses turbo outside Power and without the org flag, then routes to gpt-5.6-sol', async () => {
    const { app, store, org, project } = await setup();
    await store.upsertSubscription({ organizationId: org.id, planKey: 'pro', status: 'ACTIVE' });

    const wrongMode = await resolve(app, project.id, '?mode=economy&turbo=true');
    expect(wrongMode.statusCode).toBe(403);
    expect(wrongMode.json().code).toBe('AGENT_TURBO_POWER_ONLY');

    const noFlag = await resolve(app, project.id, '?mode=power&turbo=true');
    expect(noFlag.statusCode).toBe(403);
    expect(noFlag.json().code).toBe('AGENT_TURBO_NOT_ALLOWED');

    await store.setFeatureFlag({ key: 'agent_turbo', enabled: true, organizationId: org.id });

    const granted = await resolve(app, project.id, '?mode=power&turbo=true');
    expect(granted.statusCode).toBe(200);
    expect(granted.json().base).toMatchObject({ lineKey: 'turbo', provider: 'openai', model: 'gpt-5.6-sol' });
  });

  it('treats the literal string "false" as false (query-string boolean trap)', async () => {
    const { app, project } = await setup();
    const res = await resolve(app, project.id, '?mode=economy&highEffort=false&turbo=false');
    expect(res.statusCode).toBe(200);
    expect(res.json().escalation).toBeUndefined();
  });
});
