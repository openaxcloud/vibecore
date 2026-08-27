import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const INTERNAL_SECRET = 'ai-policy-internal-secret-2026-08-27';
const previousInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;

afterEach(() => {
  if (previousInternalSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = previousInternalSecret;
  }
});

async function setup() {
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({
    email: 'aipolicy@example.com',
    name: 'AI Policy',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'AI Org', slug: 'ai-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'ai-token', expiresAt: new Date(Date.now() + 3600_000) });
  // Team plan → BYOK is allowed by default (so the block is what flips it off).
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });
  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  return { app, store, org, project, token: 'ai-token' };
}

const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  'x-vibecore-internal-secret': INTERNAL_SECRET,
});
const quotaPayload = (idempotencyKey: string) => ({
  idempotencyKey,
  requestHash: 'b'.repeat(64),
  estimatedOutputTokens: 1,
  requestedParallelAgents: 1,
});

describe('Disable external AI integrations (org policy)', () => {
  it('allows BYOK by default on a team plan, blocks it once the policy is set', async () => {
    const { app, org, project, token } = await setup();

    const before = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('ai-policy-before'),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().byok.allowed).toBe(true);

    // Org admin blocks external AI integrations.
    const set = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/credits/ai-policy`,
      headers: auth(token),
      payload: { blockExternalAi: true },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().blockExternalAi).toBe(true);

    const after = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('ai-policy-after'),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().byok.allowed).toBe(false);
    expect(after.json().byok.reason).toBe('org-blocks-external-ai');

    // GET /credits reflects the policy for the UI toggle.
    const credits = await app.inject({ method: 'GET', url: `/orgs/${org.id}/credits`, headers: auth(token) });
    expect(credits.json().blockExternalAi).toBe(true);
  });

  it('re-allows BYOK when the policy is turned back off', async () => {
    const { app, org, project, token } = await setup();
    await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/credits/ai-policy`,
      headers: auth(token),
      payload: { blockExternalAi: true },
    });
    await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/credits/ai-policy`,
      headers: auth(token),
      payload: { blockExternalAi: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/check-quota`,
      headers: auth(token),
      payload: quotaPayload('ai-policy-reenabled'),
    });
    expect(res.json().byok.allowed).toBe(true);
  });
});
