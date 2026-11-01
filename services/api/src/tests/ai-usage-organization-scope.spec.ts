import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function fixture() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: { send: async () => undefined } });
  apps.push(app);
  const member = await store.createUser({ email: 'member@example.test', name: 'Member', passwordHash: 'unused' });
  const outsider = await store.createUser({ email: 'outsider@example.test', name: 'Outsider', passwordHash: 'unused' });
  const first = await store.createOrganization({ name: 'First', slug: 'first', ownerUserId: member.id });
  const second = await store.createOrganization({ name: 'Second', slug: 'second', ownerUserId: member.id });
  const foreign = await store.createOrganization({ name: 'Foreign', slug: 'foreign', ownerUserId: outsider.id });
  await store.createSession({ userId: member.id, token: 'scope-session', expiresAt: new Date(Date.now() + 3600000) });
  for (const [index, org] of [first, second, foreign].entries()) {
    await store.recordAiCost({
      organizationId: org.id,
      provider: 'fixture',
      model: 'fixture',
      inputTokens: index + 1,
      outputTokens: 5,
      costCents: (index + 1) * 100,
      reason: 'scope fixture',
    });
  }
  const request = (query = '') =>
    app.inject({ method: 'GET', url: `/ai/usage${query}`, headers: { authorization: 'Bearer scope-session' } });

  return { store, member, first, second, foreign, request };
}

describe('AI usage organization selection', () => {
  it('selects the requested second organization, not the first accessible one', async () => {
    const { second, request } = await fixture();
    const response = await request(`?organizationId=${second.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().usage).toMatchObject([{ organizationId: second.id, costCents: 200, inputTokens: 2 }]);
    expect(response.json().usage).toHaveLength(1);
  });

  it('does not fall back to another organization when the requested one is unauthorized', async () => {
    const { foreign, request } = await fixture();
    const response = await request(`?organizationId=${foreign.id}`);
    expect(response.statusCode).toBe(404);
    expect(response.json().usage).toBeUndefined();
  });

  it('still applies usage:read to an explicit organization', async () => {
    const { store, member, second, request } = await fixture();
    await store.addMember({ organizationId: second.id, userId: member.id, roleKey: 'no-permissions-fixture' });
    expect((await request(`?organizationId=${second.id}`)).statusCode).toBe(403);
  });

  it('retains unscoped compatibility and validates an empty explicit scope', async () => {
    const { first, request } = await fixture();
    expect((await request()).json().usage).toMatchObject([{ organizationId: first.id }]);
    expect((await request('?organizationId=')).statusCode).toBe(400);
  });
});
