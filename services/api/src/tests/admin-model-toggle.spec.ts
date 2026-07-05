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

  // Two models, both the "pro" plan can use; only modelA serves "free".
  await store.upsertModelConfig({
    provider: 'anthropic',
    modelId: 'model-a',
    displayName: 'Model A',
    enabled: true,
    enabledPlans: ['pro', 'free'],
    inputCentsPerM: 300,
    outputCentsPerM: 1500,
    contextWindow: 200000,
  });
  await store.upsertModelConfig({
    provider: 'openai',
    modelId: 'model-b',
    displayName: 'Model B',
    enabled: true,
    enabledPlans: ['pro'],
    inputCentsPerM: 250,
    outputCentsPerM: 1000,
    contextWindow: 128000,
  });

  return { app };
}

describe('F19 admin model toggle — ≥1 active model per plan', () => {
  it('allows disabling a model while the plan keeps another active model', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: auth('admin-token'),
      payload: { provider: 'openai', modelId: 'model-b', enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().model).toMatchObject({ modelId: 'model-b', enabled: false });
  });

  it('refuses a disable that would strand a plan with no active model (409)', async () => {
    const { app } = await setup();
    // Disable model-b first (pro still has model-a).
    await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: auth('admin-token'),
      payload: { provider: 'openai', modelId: 'model-b', enabled: false },
    });
    // Now disabling model-a would leave "pro" (and "free") with zero active models.
    const res = await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: auth('admin-token'),
      payload: { provider: 'anthropic', modelId: 'model-a', enabled: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PLAN_WOULD_HAVE_NO_MODEL');
  });

  it('always allows enabling a model', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: auth('admin-token'),
      payload: { provider: 'openai', modelId: 'model-b', enabled: false },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: auth('admin-token'),
      payload: { provider: 'openai', modelId: 'model-b', enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().model.enabled).toBe(true);
  });
});
