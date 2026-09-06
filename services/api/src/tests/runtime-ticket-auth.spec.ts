import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp, createRuntimeTicket, verifyRuntimeTicket } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/*
 * AUDX-004 — runtime tickets replace the session bearer in the browser.
 *
 * /api/runtime-token used to return readSessionToken(request) — the httpOnly
 * session cookie value — straight to JavaScript, defeating httpOnly entirely.
 * A ticket is short-lived, scoped to one project, and accepted ONLY on
 * /api/runtime/* routes: stealing one buys minutes of one project's runtime
 * rather than the whole account.
 *
 * Each test breaks ONE property, so a regression in any single bound fails on
 * its own rather than hiding behind the others.
 */
async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'ticket@example.com',
    name: 'Ticket User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Ticket Org', slug: 'ticket-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'session-token', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
  const other = await store.createProject({ organizationId: org.id, name: 'Other', slug: 'other' });

  return { app, store, user, org, project, other };
}

describe('AUDX-004 runtime ticket', () => {
  /* The mint route is the replacement for handing out the session token. */
  it('mints a ticket for a project the caller can reach', async () => {
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/runtime-ticket',
      headers: { authorization: 'Bearer session-token' },
      payload: { projectId: project.id },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { ticket: string };

    /*
     * The decisive assertion: what the browser receives is NOT the session
     * token. This is the whole point of the change.
     */
    expect(body.ticket).not.toBe('session-token');
    expect(body.ticket.startsWith('vcrt_')).toBe(true);
  });

  it('refuses to mint for a project the caller cannot reach', async () => {
    const { app, store } = await setup();

    const stranger = await store.createUser({
      email: 'stranger@example.com',
      name: 'Stranger',
      passwordHash: hashPassword('password123'),
    });
    const strangerOrg = await store.createOrganization({
      name: 'Stranger Org',
      slug: 'stranger-org',
      ownerUserId: stranger.id,
    });

    const foreign = await store.createProject({ organizationId: strangerOrg.id, name: 'F', slug: 'f' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/runtime-ticket',
      headers: { authorization: 'Bearer session-token' },
      payload: { projectId: foreign.id },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('requires authentication to mint', async () => {
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/runtime-ticket',
      payload: { projectId: project.id },
    });

    expect(res.statusCode).toBe(401);
  });

  /*
   * THE containment property. A ticket must not widen into general API access:
   * presented outside /api/runtime/* it is just an unknown bearer.
   */
  it('is rejected outside /api/runtime/* routes', async () => {
    const { app, project, user } = await setup();
    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ticket}` },
    });

    expect(res.statusCode).toBe(401);
  });

  /*
   * SCOPE ENFORCEMENT. The ticket names one PROJECT; a runtime route names a
   * WORKSPACE. Without resolving the workspace back to its project, a ticket for
   * a project the caller owns would drive the runtime of any other workspace id
   * they can guess — "scoped" would be a label, not a control.
   */
  it('refuses a runtime route whose workspace belongs to another project', async () => {
    const { app, store, project, other, user } = await setup();

    const foreignWorkspace = await store.createWorkspace({
      projectId: other.id,
      name: 'ws',
      runtimeMode: 'remote-kubernetes',
    });

    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    const res = await app.inject({
      method: 'GET',
      url: `/api/runtime/workspaces/${foreignWorkspace.id}/status`,
      headers: { authorization: `Bearer ${ticket}` },
    });

    expect(res.statusCode).toBe(401);
  });

  /*
   * Counterpart of the test above: a ticket for the RIGHT project must clear the
   * auth layer. Without this, "always 401" would pass the scope test while
   * breaking the feature — the failure mode rule 19 is about.
   */
  it('lets a matching ticket past the auth layer', async () => {
    const { app, store, project, user } = await setup();

    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'ws',
      runtimeMode: 'remote-kubernetes',
    });

    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    const res = await app.inject({
      method: 'GET',
      url: `/api/runtime/workspaces/${workspace.id}/status`,
      headers: { authorization: `Bearer ${ticket}` },
    });

    expect(res.statusCode).not.toBe(401);
  });

  /* Signature binding: a tampered payload must not verify. */
  it('rejects a ticket whose payload was edited', async () => {
    const { project, user } = await setup();
    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });
    const [prefixed, signature] = ticket.split('.');
    const payload = prefixed.slice('vcrt_'.length);

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    decoded.projectId = 'project-someone-elses';

    const forged = `vcrt_${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`;

    expect(verifyRuntimeTicket(forged)).toBeUndefined();
  });

  /*
   * Expiry is the whole reason a stolen ticket is cheap. It is also the ONLY
   * bound on a ticket after logout (there is no findSessionById to bind to), so
   * it has to actually be enforced.
   */
  it('rejects an expired ticket', async () => {
    const { project, user } = await setup();
    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    expect(verifyRuntimeTicket(ticket)).toBeTruthy();

    const realNow = Date.now;

    try {
      Date.now = () => realNow() + 10 * 60_000;
      expect(verifyRuntimeTicket(ticket)).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  /*
   * A multibyte signature of equal CHARACTER length but different BYTE length
   * would hand timingSafeEqual two different-sized buffers and throw — a 500
   * instead of a 401. Same trap the collaboration ticket documents.
   */
  it('rejects a multibyte signature without throwing', async () => {
    const { project, user } = await setup();
    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });
    const payload = ticket.split('.')[0];

    expect(() => verifyRuntimeTicket(`${payload}.${'é'.repeat(43)}`)).not.toThrow();
    expect(verifyRuntimeTicket(`${payload}.${'é'.repeat(43)}`)).toBeUndefined();
  });

  /*
   * AUDX-004 single-use — scoped to UPGRADES, where the ticket travels in a
   * query string and therefore leaks into access logs, Referer, history and
   * proxies. A replayed upgrade must be refused.
   */
  it('burns an upgrade ticket after its first use', async () => {
    const { app, store, project, user } = await setup();

    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'ws',
      runtimeMode: 'remote-kubernetes',
    });

    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    const upgrade = () =>
      app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/status`,
        headers: { authorization: `Bearer ${ticket}`, accept: 'text/event-stream' },
      });

    const first = await upgrade();
    expect(first.statusCode).not.toBe(401);

    const replay = await upgrade();
    expect(replay.statusCode).toBe(401);
  });

  /*
   * Rule 19 — the counterpart that decides whether this can ship. The runtime
   * adapter reuses ONE ticket across every file/port/logs call for its whole
   * 2-minute life. Burning it per HTTP request would force a mint round-trip
   * before each one: not a security improvement, a self-inflicted outage on the
   * IDE's hot path.
   */
  it('does NOT burn a ticket used on ordinary HTTP requests', async () => {
    const { app, store, project, user } = await setup();

    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'ws',
      runtimeMode: 'remote-kubernetes',
    });

    const ticket = createRuntimeTicket({ userId: user.id, projectId: project.id });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/status`,
        headers: { authorization: `Bearer ${ticket}` },
      });

      expect(response.statusCode).not.toBe(401);
    }
  });

  /* Two DIFFERENT upgrade tickets must both work — the burn is per ticket. */
  it('burns per ticket, not per project', async () => {
    const { app, store, project, user } = await setup();

    const workspace = await store.createWorkspace({
      projectId: project.id,
      name: 'ws',
      runtimeMode: 'remote-kubernetes',
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/status`,
        headers: {
          authorization: `Bearer ${createRuntimeTicket({ userId: user.id, projectId: project.id })}`,
          accept: 'text/event-stream',
        },
      });

      expect(response.statusCode).not.toBe(401);
    }
  });

  /* A garbage or absent ticket must fail closed, never fall through. */
  it('rejects a non-ticket string', () => {
    expect(verifyRuntimeTicket('session-token')).toBeUndefined();
    expect(verifyRuntimeTicket('vcrt_')).toBeUndefined();
    expect(verifyRuntimeTicket('vcrt_abc')).toBeUndefined();
  });
});
