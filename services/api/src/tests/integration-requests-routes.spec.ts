import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Integration Tester', organizationName: 'IntegrationOrg' },
  });
  expect(register.statusCode).toBe(201);

  return (register.json() as { token: string }).token;
}

describe('Integration feature request routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'intreq-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'intreq-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('submits a request scoped to the current user and lists it back', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'submit@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/integration-requests',
      headers: { authorization: `Bearer ${token}` },
      payload: { integrationName: 'Notion', useCaseDescription: 'Sync project docs into Notion.' },
    });

    expect(created.statusCode).toBe(201);

    const createdRequest = (created.json() as { request: { id: string; integrationName: string; status: string } })
      .request;
    expect(createdRequest.id).toBeTruthy();
    expect(createdRequest.integrationName).toBe('Notion');
    expect(createdRequest.status).toBe('pending');

    const list = await app.inject({
      method: 'GET',
      url: '/api/integration-requests',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);

    const listed = (list.json() as { requests: Array<{ id: string; integrationName: string; mine: boolean }> })
      .requests;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(createdRequest.id);
    expect(listed[0].integrationName).toBe('Notion');
    expect(listed[0].mine).toBe(true);

    await app.close();
  });

  it("does not leak another user's requests in the unscoped list", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tokenA = await registerUser(app, 'usera@example.com');
    const tokenB = await registerUser(app, 'userb@example.com');

    await app.inject({
      method: 'POST',
      url: '/api/integration-requests',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { integrationName: 'Stripe', useCaseDescription: 'Billing.' },
    });

    const listForB = await app.inject({
      method: 'GET',
      url: '/api/integration-requests',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(listForB.statusCode).toBe(200);
    expect((listForB.json() as { requests: unknown[] }).requests).toHaveLength(0);

    await app.close();
  });

  it('rejects an unauthenticated submission', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const created = await app.inject({
      method: 'POST',
      url: '/api/integration-requests',
      payload: { integrationName: 'Twilio', useCaseDescription: 'SMS.' },
    });

    expect(created.statusCode).toBe(401);

    await app.close();
  });

  it('rejects a submission with a missing integration name', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'invalid@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/integration-requests',
      headers: { authorization: `Bearer ${token}` },
      payload: { integrationName: '', useCaseDescription: 'No name.' },
    });

    expect(created.statusCode).toBeGreaterThanOrEqual(400);
    expect(created.statusCode).toBeLessThan(500);

    await app.close();
  });
});
