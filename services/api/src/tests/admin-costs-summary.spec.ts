import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Cost Org', slug: 'cost-org', ownerUserId: owner.id });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });
  await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('admin-token'),
    payload: { password: 'password123' },
  });

  const cost = (provider: string, costCents: number) =>
    store.recordAiCost({
      organizationId: org.id,
      provider,
      model: `${provider}-model`,
      inputTokens: 100,
      outputTokens: 100,
      costCents,
      reason: 'test',
    });

  await cost('anthropic', 500);
  await cost('openai', 300);

  return { app, store };
}

describe('F26 admin cost summary — 30d per-provider + budget alerts', () => {
  it('aggregates today spend across providers with no budget set', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/admin/costs/summary', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toHaveLength(30);
    expect(body.providers).toEqual(['anthropic', 'openai']);
    expect(body.windowTotalCents).toBe(800);
    expect(body.monthToDateCents).toBe(800);
    // last bucket = today
    expect(body.series.anthropic[29]).toBe(500);
    expect(body.series.openai[29]).toBe(300);
    expect(body.monthlyBudgetCents).toBeNull();
    expect(body.budgetUsedPct).toBeNull();
    expect(body.alertLevel).toBeNull();
  });

  it('warns at >=80% and flags over at >=100% of the monthly budget', async () => {
    const { app, store } = await setup();

    await store.setSystemSetting({ key: 'costs.monthlyBudgetCents', value: 1000 });
    const warn = await app.inject({ method: 'GET', url: '/admin/costs/summary', headers: auth('admin-token') });
    expect(warn.json().budgetUsedPct).toBe(80);
    expect(warn.json().alertLevel).toBe('warn');

    await store.setSystemSetting({ key: 'costs.monthlyBudgetCents', value: 700 });
    const over = await app.inject({ method: 'GET', url: '/admin/costs/summary', headers: auth('admin-token') });
    expect(over.json().budgetUsedPct).toBe(114);
    expect(over.json().alertLevel).toBe('over');
  });

  it('forbids non-admins', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'nope@example.com',
      name: 'Nope',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
    const res = await app.inject({ method: 'GET', url: '/admin/costs/summary', headers: auth('user-token') });
    expect(res.statusCode).toBe(403);
  });
});
