import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { GUEST_CONSENT_VERSION } from '../identity-collaboration-routes.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function appWith(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function register(app: Awaited<ReturnType<typeof appWith>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: email.split('@')[0], organizationName },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('P0-EX-07 identity collaboration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'identity-collaboration-oauth-state-test';
    process.env.ENCRYPTION_SECRET = 'identity-collaboration-encryption-test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await appWith({ store });
    const owner = await register(app, 'owner@example.com', 'Owner Org');
    const projectResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: auth(owner.token),
      payload: { name: 'Identity Project' },
    });
    expect(projectResponse.statusCode).toBe(201);
    const projectId = (projectResponse.json() as { project: { id: string } }).project.id;
    return { app, store, owner, projectId };
  }

  it('refuses unauthenticated and cross-tenant group enumeration without leaking the tenant', async () => {
    const { app, owner } = await setup();
    const outsider = await register(app, 'outsider@example.com', 'Other Org');

    const anonymous = await app.inject({ method: 'GET', url: `/orgs/${owner.organization.id}/groups` });
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/orgs/${owner.organization.id}/groups`,
      headers: auth(outsider.token),
    });

    expect(anonymous.statusCode).toBe(401);
    expect(crossTenant.statusCode).toBe(404);
  });

  it('requires explicit guest consent, clamps outsiders read-only, and revocation cuts the next request', async () => {
    const { app, store, owner, projectId } = await setup();
    const guest = await register(app, 'guest@example.com', 'Guest Org');

    const created = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: { ...auth(owner.token), 'idempotency-key': 'guest-consent-1' },
      payload: {
        subjectType: 'USER',
        subjectUserId: guest.user.id,
        roleKey: 'guest',
        expiresInHours: 24,
      },
    });
    expect(created.statusCode).toBe(201);
    const grant = (created.json() as { grant: { id: string; status: string }; replayed: boolean }).grant;
    expect(grant.status).toBe('PENDING_CONSENT');
    expect(created.json()).not.toHaveProperty('grant.requestHash');
    expect(created.json()).not.toHaveProperty('grant.idempotencyKey');

    const beforeConsent = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: auth(guest.token),
    });
    expect(beforeConsent.statusCode).toBe(404);

    const accepted = await app.inject({
      method: 'POST',
      url: `/identity/access-grants/${grant.id}/accept`,
      headers: auth(guest.token),
      payload: { consentVersion: GUEST_CONSENT_VERSION },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ grant: { status: 'ACTIVE', consentVersion: GUEST_CONSENT_VERSION } });

    const read = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: auth(guest.token),
    });
    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: auth(guest.token),
      payload: { name: 'Forbidden guest rename' },
    });
    expect(read.statusCode).toBe(200);
    // An external guest receives the same non-disclosing 404 as any outsider
    // when asking for a capability outside the accepted read scope.
    expect(write.statusCode).toBe(404);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/access-grants/${grant.id}`,
      headers: auth(owner.token),
      payload: { reason: 'Access no longer required' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ grant: { status: 'REVOKED' }, replayed: false });

    const afterRevoke = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: auth(guest.token),
    });
    expect(afterRevoke.statusCode).toBe(404);
    expect(store.auditLogs.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'project.access_grant.create',
        'project.access_grant.accept',
        'project.access_grant.revoke',
      ]),
    );
  });

  it('makes grant retries idempotent and rejects reuse with a changed request hash', async () => {
    const { app, owner, projectId } = await setup();
    const member = await register(app, 'member@example.com', 'Member Org');

    const request = (expiresInHours: number) =>
      app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: { ...auth(owner.token), 'idempotency-key': 'same-key' },
        payload: {
          subjectType: 'USER',
          subjectUserId: member.user.id,
          roleKey: 'viewer',
          expiresInHours,
        },
      });

    const first = await request(24);
    const replay = await request(24);
    const conflict = await request(48);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ replayed: true, grant: { id: first.json().grant.id } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('resolves a group grant at request time and removes access as soon as membership is removed', async () => {
    const { app, store, owner, projectId } = await setup();
    const member = await register(app, 'builder@example.com', 'Builder Org');
    await store.addMember({
      organizationId: owner.organization.id,
      userId: member.user.id,
      roleKey: 'viewer',
      invitedByUserId: owner.user.id,
    });

    const groupResponse = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/groups`,
      headers: auth(owner.token),
      payload: { name: 'Builders' },
    });
    const groupId = groupResponse.json().group.id as string;
    expect(groupResponse.statusCode).toBe(201);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/orgs/${owner.organization.id}/groups/${groupId}/members`,
          headers: auth(owner.token),
          payload: { userId: member.user.id },
        })
      ).statusCode,
    ).toBe(201);

    const grant = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: auth(owner.token),
      payload: {
        subjectType: 'GROUP',
        subjectGroupId: groupId,
        roleKey: 'editor',
        expiresInHours: 24,
      },
    });
    expect(grant.statusCode).toBe(201);
    expect(grant.json()).toMatchObject({ grant: { status: 'ACTIVE' } });

    const write = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: auth(member.token),
      payload: { name: 'Group-authorized rename' },
    });
    expect(write.statusCode).toBe(200);

    /* An explicit legacy read-only collaborator edge is a deny ceiling. */
    await store.addProjectCollaborator({ projectId, userId: member.user.id, roleKey: 'viewer' });
    const cappedWrite = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: auth(member.token),
      payload: { name: 'Read-only collaborator must win' },
    });
    expect(cappedWrite.statusCode).toBe(403);
    expect(cappedWrite.json()).toMatchObject({ code: 'PROJECT_ROLE_READ_ONLY' });
    await store.removeProjectCollaborator({ projectId, userId: member.user.id });

    await app.inject({
      method: 'DELETE',
      url: `/orgs/${owner.organization.id}/groups/${groupId}/members/${member.user.id}`,
      headers: auth(owner.token),
    });
    const writeAfterRemoval = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: auth(member.token),
      payload: { name: 'Must stay unchanged' },
    });
    expect(writeAfterRemoval.statusCode).toBe(403);
  });

  it('keeps SCIM groups IdP-owned and applies member replacement atomically', async () => {
    const { app, store, owner } = await setup();
    const member = await register(app, 'scim-member@example.com', 'SCIM Member Org');
    await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'member' });
    const token = 'scim-group-token-value';
    await store.createScimToken({ organizationId: owner.organization.id, name: 'IdP', token });

    const created = await app.inject({
      method: 'POST',
      url: `/scim/v2/${owner.organization.id}/Groups`,
      headers: auth(token),
      payload: { externalId: 'idp-engineering', displayName: 'Engineering', members: [{ value: member.user.id }] },
    });
    expect(created.statusCode).toBe(201);
    const groupId = created.json().id as string;

    const manualEdit = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/groups/${groupId}/members`,
      headers: auth(owner.token),
      payload: { userId: owner.user.id },
    });
    expect(manualEdit.statusCode).toBe(409);
    expect(manualEdit.json()).toMatchObject({ code: 'GROUP_SCIM_MANAGED' });

    const invalidReplace = await app.inject({
      method: 'PUT',
      url: `/scim/v2/${owner.organization.id}/Groups/${groupId}`,
      headers: auth(token),
      payload: { displayName: 'Should not persist', members: [{ value: 'unknown-user' }] },
    });
    expect(invalidReplace.statusCode).toBe(409);

    const unchanged = await app.inject({
      method: 'GET',
      url: `/scim/v2/${owner.organization.id}/Groups/${groupId}`,
      headers: auth(token),
    });
    expect(unchanged.statusCode).toBe(200);
    expect(unchanged.json()).toMatchObject({ displayName: 'Engineering', members: [{ value: member.user.id }] });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/scim/v2/${owner.organization.id}/Groups/${groupId}`,
      headers: auth(token),
      payload: {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'replace', path: 'displayName', value: 'Platform engineering' },
          { op: 'add', path: 'members', value: [{ value: owner.user.id }] },
          { op: 'remove', path: `members[value eq "${member.user.id}"]` },
        ],
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      displayName: 'Platform engineering',
      members: [{ value: owner.user.id }],
    });

    const invalidPath = await app.inject({
      method: 'PATCH',
      url: `/scim/v2/${owner.organization.id}/Groups/${groupId}`,
      headers: auth(token),
      payload: { Operations: [{ op: 'remove', path: 'unknownAttribute' }] },
    });
    expect(invalidPath.statusCode).toBe(400);
    expect(invalidPath.json()).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '400',
      scimType: 'invalidPath',
    });

    const withoutToken = await app.inject({ method: 'GET', url: `/scim/v2/${owner.organization.id}/Groups` });
    expect(withoutToken.statusCode).toBe(401);
    expect(withoutToken.json()).toMatchObject({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
    });
  });

  it('does not let an expired grant be renewed by acceptance and permits a fresh replacement grant', async () => {
    const { app, store, owner, projectId } = await setup();
    const guest = await register(app, 'expired-guest@example.com', 'Expired Guest Org');
    const created = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: auth(owner.token),
      payload: {
        subjectType: 'USER',
        subjectUserId: guest.user.id,
        roleKey: 'viewer',
        expiresInHours: 1,
      },
    });
    const grantId = created.json().grant.id as string;
    const stored = store.resourceAccessGrants.get(grantId)!;
    store.resourceAccessGrants.set(grantId, { ...stored, expiresAt: new Date(Date.now() - 1_000).toISOString() });

    const accept = await app.inject({
      method: 'POST',
      url: `/identity/access-grants/${grantId}/accept`,
      headers: auth(guest.token),
      payload: { consentVersion: GUEST_CONSENT_VERSION },
    });
    expect(accept.statusCode).toBe(409);
    expect(accept.json()).toMatchObject({ code: 'GRANT_EXPIRED' });

    const replacement = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: auth(owner.token),
      payload: {
        subjectType: 'USER',
        subjectUserId: guest.user.id,
        roleKey: 'viewer',
        expiresInHours: 24,
      },
    });
    expect(replacement.statusCode).toBe(201);
    expect(replacement.json().grant.id).not.toBe(grantId);
  });

  it('cuts an already-open collaboration socket on the first frame after grant revocation', async () => {
    const { app, owner, projectId } = await setup();
    const guest = await register(app, 'socket-guest@example.com', 'Socket Guest Org');
    const created = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: auth(owner.token),
      payload: {
        subjectType: 'USER',
        subjectUserId: guest.user.id,
        roleKey: 'viewer',
        expiresInHours: 24,
      },
    });
    const grantId = created.json().grant.id as string;
    await app.inject({
      method: 'POST',
      url: `/identity/access-grants/${grantId}/accept`,
      headers: auth(guest.token),
      payload: { consentVersion: GUEST_CONSENT_VERSION },
    });
    const ticket = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/collaboration/ws-ticket?sessionId=revoked-guest`,
      headers: auth(guest.token),
    });
    expect(ticket.statusCode).toBe(200);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const socket = new WebSocket(
      `${address.replace(/^http/, 'ws')}/projects/${projectId}/collaboration/ws?ticket=${encodeURIComponent(
        ticket.json().ticket,
      )}&sessionId=revoked-guest`,
    );

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Collaboration socket did not become ready')), 2_000);
        socket.addEventListener('message', (event) => {
          const payload = JSON.parse(String(event.data));
          if (payload.type === 'collaboration.ready') {
            clearTimeout(timeout);
            resolve();
          }
        });
        socket.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('Collaboration socket failed before ready'));
        });
      });

      const revoked = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}/access-grants/${grantId}`,
        headers: auth(owner.token),
        payload: { reason: 'Socket access revoked' },
      });
      expect(revoked.statusCode).toBe(200);

      const denied = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Revoked collaboration socket stayed authorized')), 2_000);
        socket.addEventListener('message', (event) => {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (payload.type === 'error') {
            clearTimeout(timeout);
            resolve(payload);
          }
        });
      });
      const closed = new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Revoked collaboration socket was not closed')), 2_000);
        socket.addEventListener('close', (event) => {
          clearTimeout(timeout);
          resolve(event.code);
        });
      });
      socket.send(JSON.stringify({ type: 'presence.update', payload: { status: 'online' } }));
      await expect(denied).resolves.toMatchObject({ error: { code: 'ORG_NOT_FOUND' } });
      await expect(closed).resolves.toEqual(expect.any(Number));
    } finally {
      socket.close();
      await app.close();
    }
  });
});
