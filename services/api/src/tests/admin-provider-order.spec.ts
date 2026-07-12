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

  return { app, store };
}

describe('F18 admin provider fallback order', () => {
  it('returns a complete order and is honest that metrics are not yet recorded', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/providers/fallback-order',
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.order).toContain('Anthropic');
    expect(body.order).toContain('Google');
    expect(body.metricsAvailable).toBe(false);
    expect(body.thresholds).toEqual({ warnErrorPct: 2, errorErrorPct: 5 });
  });

  it('surfaces REAL p95 latency + 24h error rate once provider metrics are recorded', async () => {
    const { app, store } = await setup();

    // 20 OpenAI requests, 2 errored, rising latencies 10..200ms.
    for (let i = 0; i < 20; i++) {
      await store.createProviderRequestMetric({
        provider: 'OpenAI',
        model: 'gpt-4o',
        latencyMs: (i + 1) * 10,
        errored: i < 2,
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/admin/providers/fallback-order',
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.metricsAvailable).toBe(true);
    expect(body.window).toBe('24h');

    const openai = body.providers.find((p: { provider: string }) => p.provider === 'OpenAI');
    expect(openai.sampleCount).toBe(20);
    expect(openai.p95LatencyMs).toBe(190); // ceil(0.95*20)=19 → index 18 → 190ms
    expect(openai.errorRatePct).toBe(10);

    // A provider with no samples stays null — never a fabricated number.
    const google = body.providers.find((p: { provider: string }) => p.provider === 'Google');
    expect(google.sampleCount).toBe(0);
    expect(google.p95LatencyMs).toBeNull();
    expect(google.errorRatePct).toBeNull();
  });

  it('persists a reordered fallback list (unknown providers dropped)', async () => {
    const { app } = await setup();

    const save = await app.inject({
      method: 'POST',
      url: '/admin/providers/fallback-order',
      headers: auth('admin-token'),
      payload: { order: ['Google', 'Anthropic', 'NotARealProvider'] },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().order).toEqual(['Google', 'Anthropic']);

    const after = await app.inject({
      method: 'GET',
      url: '/admin/providers/fallback-order',
      headers: auth('admin-token'),
    });
    // saved order comes first, remaining known providers appended
    expect(after.json().order.slice(0, 2)).toEqual(['Google', 'Anthropic']);
    expect(after.json().order).toContain('Cohere');
  });

  it('forbids non-admins', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'nope@example.com',
      name: 'Nope',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/fallback-order',
      headers: auth('user-token'),
      payload: { order: ['Anthropic'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('the enabled-provider resolution honors the saved fallback order', async () => {
    const { app, store } = await setup();

    // A regular (non-admin) authed user reads /providers/enabled during resolution.
    const user = await store.createUser({
      email: 'user@example.com',
      name: 'User',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const before = await app.inject({ method: 'GET', url: '/providers/enabled', headers: auth('user-token') });
    expect(before.statusCode).toBe(200);
    // Default order is the static KNOWN_LLM_PROVIDERS list (Anthropic before Google).
    const beforeList: string[] = before.json().providers;
    expect(beforeList.indexOf('Anthropic')).toBeLessThan(beforeList.indexOf('Google'));

    // Admin reprioritizes Google ahead of Anthropic.
    await app.inject({
      method: 'POST',
      url: '/admin/providers/fallback-order',
      headers: auth('admin-token'),
      payload: { order: ['Google', 'Anthropic'] },
    });

    const after = await app.inject({ method: 'GET', url: '/providers/enabled', headers: auth('user-token') });
    const afterList: string[] = after.json().providers;
    expect(afterList[0]).toBe('Google');
    expect(afterList.indexOf('Google')).toBeLessThan(afterList.indexOf('Anthropic'));
    // Providers not placed in the saved order are still present (appended).
    expect(afterList).toContain('OpenAI');
  });
});
