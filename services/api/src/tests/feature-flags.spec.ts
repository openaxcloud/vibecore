import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import {
  FeatureDisabledError,
  assertFeatureEnabled,
  evaluateFeatureFlag,
  featureFlagBucket,
  flagEnabledForUser,
} from '../feature-flags.js';
import { TestApiStore } from './test-api-store.js';
import type { FeatureFlagRecord } from '../store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

function flag(overrides: Partial<FeatureFlagRecord>): FeatureFlagRecord {
  return { id: 'f', key: 'k', enabled: true, ...overrides };
}

describe('feature flag evaluation (pure)', () => {
  it('honours the enabled bit', () => {
    expect(flagEnabledForUser(flag({ enabled: false }), 'u1')).toBe(false);
    expect(flagEnabledForUser(flag({ enabled: true }), 'u1')).toBe(true);
  });

  it('treats rollout 0 as off and 100 (or undefined) as fully on', () => {
    expect(flagEnabledForUser(flag({ enabled: true, rolloutPercent: 0 }), 'u1')).toBe(false);
    expect(flagEnabledForUser(flag({ enabled: true, rolloutPercent: 100 }), 'u1')).toBe(true);
    expect(flagEnabledForUser(flag({ enabled: true, rolloutPercent: undefined }), 'u1')).toBe(true);
  });

  it('buckets a user deterministically and consistently with the rollout', () => {
    const bucket = featureFlagBucket('k:u1');
    expect(bucket).toBe(featureFlagBucket('k:u1')); // stable
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);

    // A user always lands on the same side of a partial rollout.
    const justAbove = flag({ enabled: true, rolloutPercent: bucket + 1 });
    const justBelowOrEqual = flag({ enabled: true, rolloutPercent: bucket });
    expect(flagEnabledForUser(justAbove, 'u1')).toBe(true);
    expect(flagEnabledForUser(justBelowOrEqual, 'u1')).toBe(false);
  });

  it('approximates the rollout percentage across many users', () => {
    let enabled = 0;
    const total = 2000;
    for (let i = 0; i < total; i += 1) {
      if (flagEnabledForUser(flag({ enabled: true, rolloutPercent: 30 }), `user-${i}`)) {
        enabled += 1;
      }
    }
    const ratio = enabled / total;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.4);
  });
});

describe('feature flag evaluation (store-backed)', () => {
  it('prefers an organization override over the global flag', async () => {
    const store = new TestApiStore();
    await store.setFeatureFlag({ key: 'beta', enabled: false }); // global off
    await store.setFeatureFlag({ organizationId: 'org_1', key: 'beta', enabled: true }); // org on

    expect(await evaluateFeatureFlag(store, 'beta', { userId: 'u1', organizationId: 'org_1' })).toBe(true);
    expect(await evaluateFeatureFlag(store, 'beta', { userId: 'u1' })).toBe(false);
    expect(await evaluateFeatureFlag(store, 'beta', { userId: 'u1', organizationId: 'org_2' })).toBe(false);
  });

  it('treats an unknown flag as closed', async () => {
    const store = new TestApiStore();
    expect(await evaluateFeatureFlag(store, 'missing', { userId: 'u1' })).toBe(false);
  });

  it('assertFeatureEnabled throws FeatureDisabledError when off and resolves when on', async () => {
    const store = new TestApiStore();
    await store.setFeatureFlag({ key: 'gated', enabled: false });

    await expect(assertFeatureEnabled(store, 'gated', { userId: 'u1' })).rejects.toBeInstanceOf(FeatureDisabledError);

    await store.setFeatureFlag({ key: 'gated', enabled: true });
    await expect(assertFeatureEnabled(store, 'gated', { userId: 'u1' })).resolves.toBeUndefined();
  });
});

describe('feature flag endpoints', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'flag-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'flag-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>) {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'flag@example.com', password: 'password123', name: 'Flag', organizationName: 'Flag Org' },
    });
    expect(response.statusCode).toBe(201);

    return response.json() as { token: string; organization: { id: string } };
  }

  it('exposes per-user evaluated flags and a single-flag check', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const user = await registerUser(app);

    await store.setFeatureFlag({ key: 'new-editor', enabled: true });
    await store.setFeatureFlag({ key: 'half-baked', enabled: true, rolloutPercent: 0 });

    const all = await app.inject({
      method: 'GET',
      url: '/feature-flags',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(all.statusCode).toBe(200);
    const flags = (all.json() as { flags: Record<string, boolean> }).flags;
    expect(flags['new-editor']).toBe(true);
    expect(flags['half-baked']).toBe(false);

    const single = await app.inject({
      method: 'GET',
      url: '/feature-flags/new-editor',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(single.statusCode).toBe(200);
    expect(single.json()).toEqual({ key: 'new-editor', enabled: true });

    await app.close();
  });

  it('applies an organization override via the x-org-id context', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const user = await registerUser(app);

    await store.setFeatureFlag({ key: 'beta', enabled: false });
    await store.setFeatureFlag({ organizationId: user.organization.id, key: 'beta', enabled: true });

    const withoutOrg = await app.inject({
      method: 'GET',
      url: '/feature-flags/beta',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect((withoutOrg.json() as { enabled: boolean }).enabled).toBe(false);

    const withOrg = await app.inject({
      method: 'GET',
      url: '/feature-flags/beta',
      headers: { authorization: `Bearer ${user.token}`, 'x-org-id': user.organization.id },
    });
    expect((withOrg.json() as { enabled: boolean }).enabled).toBe(true);

    await app.close();
  });
});
