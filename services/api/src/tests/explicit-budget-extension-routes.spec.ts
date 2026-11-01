import { randomUUID } from 'node:crypto';
import { buildExplicitRunPermit, BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import { EXPLICIT_EXTENSION_POLICY as policy } from '../explicit-budget-extension-policy.js';
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: { async send() {} } });
  const admin = await store.createUser({
    email: 'budget-admin@example.test',
    passwordHash: 'synthetic-unused',
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  const session = await store.createSession({
    userId: admin.id,
    token: 'synthetic-admin-token',
    expiresAt: new Date(Date.now() + 3600000),
  });
  await store.markSessionReauthenticated(session.id);
  const user = await store.createUser({ email: 'budget-user@example.test', passwordHash: 'synthetic-unused' });
  await store.createSession({
    userId: user.id,
    token: 'synthetic-user-token',
    expiresAt: new Date(Date.now() + 3600000),
  });
  await store.createSession({
    userId: admin.id,
    token: 'synthetic-stale-token',
    expiresAt: new Date(Date.now() + 3600000),
  });
  const org = await store.createOrganization({
    name: 'Synthetic budget',
    slug: policy.organizationSlug,
    ownerUserId: user.id,
  });
  const project = await store.createProject({
    organizationId: org.id,
    name: 'Synthetic target',
    slug: 'synthetic-target',
  });
  store.projects.delete(project.id);
  store.projects.set(policy.projectId, { ...project, id: policy.projectId });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'free', status: 'ACTIVE' });
  await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });
  const permit = buildExplicitRunPermit({
    projectId: policy.projectId,
    runId: randomUUID(),
    planKey: 'free',
    card: BUILTIN_AGENT_ROUTING_CARD,
  });
  await store.reserveExplicitRun(permit);
  const get = (token = 'synthetic-admin-token') =>
    app.inject({
      method: 'GET',
      url: `/admin/projects/${policy.projectId}/explicit-budget-extension`,
      headers: { authorization: `Bearer ${token}` },
    });
  const post = (body: object, token = 'synthetic-admin-token', projectId: string = policy.projectId) =>
    app.inject({
      method: 'POST',
      url: `/admin/projects/${projectId}/explicit-budget-extension`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  return { store, app, get, post, permit, org };
}
it('offers a readonly proposal and admits only one audited project extension', async () => {
  const { store, app, get, post, permit } = await setup();
  try {
    const proposal = await get();
    expect(proposal.statusCode).toBe(200);
    expect(proposal.headers['cache-control']).toBe('no-store');
    const body = proposal.json();
    expect(body.eligible).toBe(true);
    expect(await store.getExplicitRunBudgetState(policy.projectId)).not.toHaveProperty('extension');
    const saved = await post(body.proposal);
    expect(saved.statusCode).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(saved.json()).toMatchObject({ summary: { limitMicros: 30520000, reservedMicros: 15260000 } });
    expect((await post(body.proposal)).json().idempotent).toBe(true);
    expect(store.auditLogs.filter((x) => x.action === 'admin.project.explicit_budget.extend')).toHaveLength(1);
    expect(await store.getExplicitRunPermit(policy.projectId, permit.runId)).toEqual(permit);
  } finally {
    await app.close();
  }
});

it('requires platform admin and recent reauthentication and rejects other project/approval scopes', async () => {
  const { app, get, post } = await setup();
  try {
    const proposal = (await get()).json().proposal;
    expect((await get('missing')).statusCode).toBe(401);
    expect((await get('synthetic-user-token')).statusCode).toBe(403);
    expect((await post(proposal, 'synthetic-user-token')).statusCode).toBe(403);
    expect((await post(proposal, 'synthetic-stale-token')).json().code).toBe('ADMIN_REAUTH_REQUIRED');
    expect((await post(proposal, 'synthetic-admin-token', 'other-project')).statusCode).toBe(403);
    expect((await post({ ...proposal, approvalId: 'different' })).statusCode).toBe(400);
    expect((await post({ ...proposal, expectedOrganizationSlug: 'different' })).statusCode).toBe(400);
    expect((await post({ ...proposal, approvedBy: 'spoof' })).statusCode).toBe(400);
  } finally {
    await app.close();
  }
});
it('rejects a stale full ledger snapshot and a changed active routing card', async () => {
  const { store, app, get, post, permit } = await setup();
  try {
    const body = (await get()).json().proposal;
    const key = `agent.explicit-run.v1:${policy.projectId}`;
    const saved = store.systemSettings.get(key)!;
    const changed = structuredClone(saved.value) as { permits: Array<typeof permit> };
    changed.permits[0].accounting.platformInputCentsPerMillion += 1;
    store.systemSettings.set(key, { ...saved, value: changed });
    expect((await post(body)).statusCode).toBe(409);
    store.systemSettings.set(key, saved);
    await store.createAgentRoutingCardVersion({ data: BUILTIN_AGENT_ROUTING_CARD });
    expect((await post(body)).json().code).toBe('EXPLICIT_RUN_EXTENSION_UNAVAILABLE');
    expect(store.auditLogs.filter((x) => x.action === 'admin.project.explicit_budget.extend')).toHaveLength(0);
  } finally {
    await app.close();
  }
});
it('allows one additional reservation and refuses another or a transfer outside the authorized organization', async () => {
  const { store, app, get, post, permit } = await setup();
  try {
    const body = (await get()).json().proposal;
    expect((await post(body)).statusCode).toBe(200);
    const before = store.projects.get(policy.projectId)!;
    const foreign = await store.createOrganization({
      name: 'Other synthetic',
      slug: 'other-synthetic',
      ownerUserId: 'unused',
    });
    store.projects.set(policy.projectId, { ...before, organizationId: foreign.id });
    expect((await store.reserveExplicitRun({ ...permit, runId: randomUUID() })).ok).toBe(false);
    store.projects.set(policy.projectId, before);
    const results = await Promise.all([
      store.reserveExplicitRun({ ...permit, runId: randomUUID() }),
      store.reserveExplicitRun({ ...permit, runId: randomUUID() }),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect((await store.getExplicitRunBudgetSummary(policy.projectId))?.reservedMicros).toBe(30520000);
    expect(await store.getExplicitRunPermit(policy.projectId, permit.runId)).toEqual(permit);
  } finally {
    await app.close();
  }
});
it('refuses unsupported provider endpoints, live billing and higher reservation prices without a grant', async () => {
  const { store, app, get, post } = await setup();
  try {
    const body = (await get()).json().proposal;
    await store.upsertProviderConfig({
      provider: 'OpenAI',
      displayName: 'OpenAI',
      enabled: true,
      baseUrl: 'https://other.example.test',
    });
    expect((await get()).json()).toMatchObject({ eligible: false, provider: { baseUrlSafe: false } });
    expect((await post(body)).statusCode).toBe(409);
    await store.upsertProviderConfig({
      provider: 'OpenAI',
      displayName: 'OpenAI',
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
    });
    vi.stubEnv('BILLING_CREDITS_ENABLED', 'true');
    expect((await post(body)).statusCode).toBe(409);
    vi.unstubAllEnvs();
    store.getActiveAgentRoutingCard = async () => ({
      version: BUILTIN_AGENT_ROUTING_CARD.version,
      data: {
        ...BUILTIN_AGENT_ROUTING_CARD,
        baseUserInCentsPerM: BUILTIN_AGENT_ROUTING_CARD.baseUserInCentsPerM * 1.1,
      },
    });
    expect((await post(body)).statusCode).toBe(409);
  } finally {
    await app.close();
  }
});

it('fails closed on malformed extension/permit snapshots without throwing or writing', async () => {
  const { store, app, get, post } = await setup();
  try {
    const body = (await get()).json().proposal;
    const key = `agent.explicit-run.v1:${policy.projectId}`;
    const original = store.systemSettings.get(key)!;
    for (const value of [
      { ...(original.value as object), extension: {} },
      { ...(original.value as object), permits: null },
      { ...(original.value as object), runIds: 'invalid' },
    ]) {
      store.systemSettings.set(key, { ...original, value });
      expect((await get()).statusCode).toBe(503);
      expect((await post(body)).statusCode).toBe(409);
    }
    expect(store.auditLogs.filter((x) => x.action === 'admin.project.explicit_budget.extend')).toHaveLength(0);
  } finally {
    await app.close();
  }
});
