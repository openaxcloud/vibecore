import { randomUUID } from 'node:crypto';
import { BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

async function setup() {
  const store = new TestApiStore();
  await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });

  const app = await buildApiApp({ store, emailProvider: { async send() {} } });

  const user = await store.createUser({
    email: 'explicit@example.com',
    name: 'Synthetic',
    passwordHash: 'synthetic-unused',
  });

  const org = await store.createOrganization({ name: 'Synthetic', slug: 'explicit', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'Synthetic', slug: 'explicit' });
  await store.createSession({ userId: user.id, token: 'explicit-token', expiresAt: new Date(Date.now() + 3600000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'free', status: 'ACTIVE' });

  const payload = () => ({
    runId: randomUUID(),
    choice: { modele: 'gpt-5.6-luna' },
    mode: 'lite',
    highEffort: false,
    turbo: false,
  });
  const invoke = (body: unknown, token = 'explicit-token') =>
    app.inject({
      method: 'POST',
      url: `/projects/${project.id}/agent/explicit-run`,
      headers: { authorization: `Bearer ${token}` },
      payload: body as object,
    });

  return { store, app, org, project, payload, invoke };
}

describe('explicit run reservation route', () => {
  it('issues a bounded permit, rejects replay, and serializes concurrent reservations', async () => {
    const { app, invoke, payload } = await setup();

    try {
      const body = payload();
      const simultaneous = await Promise.all([invoke(body), invoke(payload())]);
      expect(simultaneous.map((r) => r.statusCode).sort()).toEqual([200, 409]);

      const first = simultaneous[0];
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ kind: 'bounded-explicit-v1', maxCalls: 2, reservedBudgetMicros: 15260000 });
      expect((await invoke(body)).json().code).toBe('EXPLICIT_RUN_REPLAY');

      const results = await Promise.all(Array.from({ length: 10 }, () => invoke(payload())));
      expect(results.filter((result) => result.statusCode === 200)).toHaveLength(0);
      expect(results.filter((result) => result.json().code === 'EXPLICIT_RUN_BUDGET_EXCEEDED')).toHaveLength(10);
    } finally {
      await app.close();
    }
  });
  it('rejects unauthenticated/foreign users and non-whitelisted options before reservation', async () => {
    const { app, store, invoke, payload } = await setup();

    try {
      expect((await invoke(payload(), 'missing')).statusCode).toBe(401);

      const foreign = await store.createUser({ email: 'foreign@example.com', passwordHash: 'synthetic-unused' });
      await store.createSession({ userId: foreign.id, token: 'foreign', expiresAt: new Date(Date.now() + 3600000) });
      expect((await invoke(payload(), 'foreign')).statusCode).toBe(404);

      for (const change of [
        { choice: { modele: 'gpt-5.6-luna-fast' } },
        { choice: { modele: 'gpt-5.6-luna', effort: 'high' } },
        { choice: { modele: 'gpt-5.6-luna', serviceTier: 'fast' } },
        { turbo: true },
        { highEffort: true },
        { mode: 'max' },
      ]) {
        expect((await invoke({ ...payload(), ...change })).statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });
  it('fails closed for unknown plans, missing cards and nonpositive active prices', async () => {
    const { app, store, org, invoke, payload } = await setup();
    const reserve = vi.spyOn(store, 'reserveExplicitRun');

    try {
      await store.upsertSubscription({ organizationId: org.id, planKey: 'free', status: 'UNPAID' });
      expect((await invoke(payload())).statusCode).toBe(403);
      await store.upsertSubscription({ organizationId: org.id, planKey: 'free', status: 'ACTIVE' });
      store.getActiveAgentRoutingCard = async () => undefined;
      expect((await invoke(payload())).statusCode).toBe(403);
      store.getActiveAgentRoutingCard = async () => ({
        version: BUILTIN_AGENT_ROUTING_CARD.version,
        data: { ...BUILTIN_AGENT_ROUTING_CARD, baseUserInCentsPerM: 0 },
      });
      expect((await invoke(payload())).statusCode).toBe(403);
      expect(reserve).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

it('refuses live or ambiguous credit billing without reserving budget', async () => {
  const { app, invoke, payload } = await setup();

  try {
    for (const value of ['true', 'TRUE', '1', '']) {
      vi.stubEnv('BILLING_CREDITS_ENABLED', value);
      expect((await invoke(payload())).json().code).toBe('EXPLICIT_RUN_LIVE_BILLING_UNSUPPORTED');
    }
    vi.stubEnv('BILLING_CREDITS_ENABLED', 'false');
    expect((await invoke(payload())).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});

it('records explicit usage from its persisted snapshot after the active card changes', async () => {
  const { app, store, project, invoke, payload } = await setup();

  try {
    const permit = (await invoke(payload())).json();
    store.getActiveAgentRoutingCard = async () => ({
      version: 999,
      data: { ...BUILTIN_AGENT_ROUTING_CARD, version: 999, baseUserInCentsPerM: 999999 },
    });

    const usage = {
      provider: 'OpenAI',
      model: 'gpt-5.6-luna',
      inputTokens: 1000,
      outputTokens: 100,
      agentRouting: { mode: 'lite', lineKey: 'lite', explicitRunId: permit.runId },
    };
    const result = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: { authorization: 'Bearer explicit-token' },
      payload: usage,
    });
    expect(result.statusCode).toBe(200);
    expect((await store.listAgentCalls())[0]).toMatchObject({
      routingCardVersion: permit.routingVersion,
      provider: 'OpenAI',
      model: 'gpt-5.6-luna',
      creditCents: 1,
      costMillicents: 32,
      source: 'explicit-standard-estimate',
    });

    const mismatch = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: { authorization: 'Bearer explicit-token' },
      payload: { ...usage, model: 'different' },
    });
    expect(mismatch.statusCode).toBe(403);
  } finally {
    await app.close();
  }
});

it('refuses missing, disabled or redirected provider configuration', async () => {
  const { app, store, invoke, payload } = await setup();
  const reserve = vi.spyOn(store, 'reserveExplicitRun');

  try {
    store.providerConfigs.clear();
    await store.upsertProviderConfig({ provider: 'openai', displayName: 'Wrong-case', enabled: true });
    expect((await invoke(payload())).json().code).toBe('EXPLICIT_RUN_PROVIDER_UNAVAILABLE');
    store.providerConfigs.clear();
    expect((await invoke(payload())).json().code).toBe('EXPLICIT_RUN_PROVIDER_UNAVAILABLE');
    await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: false });
    expect((await invoke(payload())).statusCode).toBe(403);
    await store.upsertProviderConfig({
      provider: 'OpenAI',
      displayName: 'OpenAI',
      enabled: true,
      baseUrl: 'https://example.invalid/v1',
    });
    expect((await invoke(payload())).statusCode).toBe(403);
    expect(reserve).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it.each([
  ['en', 'Explicit provider unavailable.'],
  ['fr', 'Le fournisseur choisi est indisponible.'],
])('localizes explicit provider refusal in %s without changing its machine code', async (locale, message) => {
  const { app, store, project, payload } = await setup();
  try {
    store.providerConfigs.clear();
    const result = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/agent/explicit-run`,
      headers: { authorization: 'Bearer explicit-token', 'accept-language': locale },
      payload: payload(),
    });
    expect(result.statusCode).toBe(403);
    expect(result.json()).toMatchObject({ code: 'EXPLICIT_RUN_PROVIDER_UNAVAILABLE', error: message });
  } finally {
    await app.close();
  }
});
