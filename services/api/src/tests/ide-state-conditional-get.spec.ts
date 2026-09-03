import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/*
 * AUDX-167 — GET /projects/:id/ide-state was measured in production at 572 to
 * 3 914 ms, all spent server-side before the first byte, against 220 ms for
 * /api/health on the same infrastructure.
 *
 * That crosses the IDE's 5 s abandon threshold, and the conversation panel then
 * stays empty for the whole life of the page: a latency problem that presents
 * as a broken feature, which is why it earns a registry line rather than a
 * performance ticket.
 *
 * The route already emitted an ETag and never looked at If-None-Match, so every
 * load re-read and re-serialised the whole (unbounded — the PUT accepts up to
 * API_BODY_LIMIT_BYTES, 25 MB) state blob. These pin the conditional GET.
 */
async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'ide@example.com',
    name: 'Ide',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Ide Org', slug: 'ide-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'tok', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  await store.upsertProjectIdeState({ projectId: project.id, state: { openTabs: ['a.ts'] } });

  return { app, store, project };
}

function get(app: Awaited<ReturnType<typeof setup>>['app'], projectId: string, ifNoneMatch?: string) {
  return app.inject({
    method: 'GET',
    url: `/projects/${projectId}/ide-state`,
    headers: { authorization: 'Bearer tok', ...(ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}) },
  });
}

describe('AUDX-167 ide-state conditional GET', () => {
  it('returns the state with an ETag on a cold load', async () => {
    const { app, project } = await setup();

    const response = await get(app, project.id);

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBeTruthy();
    expect(response.json().ideState).toBeTruthy();
  });

  /* The point of the change: a revisit costs no body at all. */
  it('answers 304 with no body when the client already holds the version', async () => {
    const { app, project } = await setup();
    const first = await get(app, project.id);

    const second = await get(app, project.id, String(first.headers.etag));

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
  });

  /*
   * Rule 19: a stale ETag must still be served in full. A conditional GET that
   * answered 304 to an out-of-date client would leave the IDE showing an old
   * state forever — worse than the slowness it replaces.
   */
  it('serves the full state when the held version is stale', async () => {
    const { app, store, project } = await setup();
    const first = await get(app, project.id);

    await store.upsertProjectIdeState({ projectId: project.id, state: { openTabs: ['a.ts', 'b.ts'] } });

    const second = await get(app, project.id, String(first.headers.etag));

    expect(second.statusCode).toBe(200);
    expect(second.json().ideState.state.openTabs).toHaveLength(2);
  });

  /* A multi-value If-None-Match (RFC 9110) must still match. */
  it('matches one entry of a comma-separated If-None-Match', async () => {
    const { app, project } = await setup();
    const first = await get(app, project.id);

    const second = await get(app, project.id, `"999", ${first.headers.etag}`);

    expect(second.statusCode).toBe(304);
  });

  it('still answers a project that has no saved state', async () => {
    const { app, store, project } = await setup();
    const existing = await store.getProject(project.id);
    const empty = await store.createProject({ organizationId: existing!.organizationId, name: 'E', slug: 'e' });

    const response = await get(app, empty.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().ideState).toBeNull();
  });
});
