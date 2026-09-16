import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/*
 * AUDX-017 — /ai/record-usage is a source of CLIENT-DECLARED tokens.
 *
 * It is a session-authenticated HTTP route that writes billing rows from
 * `inputTokens` / `outputTokens` taken straight out of the request body. Anyone
 * holding a user session can post `inputTokens: 0` and bill nothing — or simply
 * never post at all. `packages/billing/src/ai-pricing.ts` already documents the
 * gap: the route zod-validates the SHAPE, never the TRUTH.
 *
 * The LLM call does not yet go through the ai-gateway (see the C1.b.4 note in
 * app/lib/.server/ai-usage.ts), so the counts cannot be recomputed here. What
 * can be established is PROVENANCE: a report carrying the internal shared secret
 * is server-to-server and recorded 'trusted'; everything else is 'declared' and
 * stays reconcilable instead of silently believed.
 */
const INTERNAL_SECRET = 'internal-shared-secret';
const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;

afterEach(() => {
  if (previousSecret === undefined) {
    delete process.env.INTERNAL_API_SHARED_SECRET;
  } else {
    process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
  }
});

async function setup() {
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;

  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'meter@example.com',
    name: 'Meter User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Meter Org', slug: 'meter-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'session-token', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });

  return { app, store, org, project };
}

function report(
  app: Awaited<ReturnType<typeof setup>>['app'],
  projectId: string,
  extraHeaders: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/record-usage`,
    headers: { authorization: 'Bearer session-token', ...extraHeaders },
    payload: { provider: 'anthropic', model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 500 },
  });
}

describe('AUDX-017 AI usage provenance', () => {
  /*
   * The decisive test. Without this the whole mechanism is decorative: the auth
   * preHandler consumes the Authorization header for the session, so an
   * internal-secret BEARER would 401 before the route ever ran. The trusted path
   * has to be REACHABLE, and this proves it is.
   */
  it('records a server-to-server report as trusted', async () => {
    const { app, store, org, project } = await setup();

    const response = await report(app, project.id, { 'x-vibecore-internal': INTERNAL_SECRET });
    expect(response.statusCode).toBe(200);

    const costs = await store.listAiCosts(org.id);
    expect(costs).toHaveLength(1);
    expect(costs[0].source).toBe('trusted');
  });

  /* A plain user session cannot claim trust. */
  it('records a session-only report as declared', async () => {
    const { app, store, org, project } = await setup();

    await report(app, project.id);

    const costs = await store.listAiCosts(org.id);
    expect(costs[0].source).toBe('declared');
  });

  /* A guessed/wrong secret must not be believed. */
  it('records a report with a WRONG internal secret as declared', async () => {
    const { app, store, org, project } = await setup();

    await report(app, project.id, { 'x-vibecore-internal': 'not-the-secret' });

    const costs = await store.listAiCosts(org.id);
    expect(costs[0].source).toBe('declared');
  });

  /*
   * Fail closed on configuration: with no secret configured, NOTHING can be
   * trusted — an empty expected value must not match an empty provided one.
   */
  it('never marks trusted when no internal secret is configured', async () => {
    const { app, store, org, project } = await setup();
    delete process.env.INTERNAL_API_SHARED_SECRET;

    await report(app, project.id, { 'x-vibecore-internal': '' });

    const costs = await store.listAiCosts(org.id);
    expect(costs[0].source).toBe('declared');
  });

  /*
   * Rule 19: metering must not stop because provenance cannot be proven. A
   * declared row is still written — losing the row entirely would be strictly
   * worse than marking it.
   */
  it('still records the usage when provenance cannot be proven', async () => {
    const { app, store, org, project } = await setup();

    const response = await report(app, project.id);

    expect(response.statusCode).toBe(200);
    expect(await store.listAiCosts(org.id)).toHaveLength(1);
  });
});
