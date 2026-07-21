/*
 * Negative-first specs for IDENTITY_COLLABORATION_CONTRACT (P0-EX-07):
 * groups (SCIM-managed refusal), guests with narrow scope, generic access
 * grants with expiry and explicit revocation — all enforced SERVER-side
 * through real routes (app.inject), never client-side.
 */

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

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Identity Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

describe('identity & collaboration — groups, guests, access grants', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'idc-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'idc-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, 'owner@example.com', 'Identity Org');

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Identity Project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { store, app, owner, projectId };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('négatifs — les refus d’abord', () => {
    it('un invité (guest) hors de sa portée est refusé : lecture OK, écriture 403, autre projet 404', async () => {
      const { store, app, owner, projectId } = await setup();
      const guest = await register(app, 'guest@example.com', 'Guest Own Org');

      // Guest grant: an outsider with the narrow guest role on ONE project.
      const grantRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: { subjectType: 'USER', subjectUserId: guest.user.id, roleKey: 'guest' },
      });
      expect(grantRes.statusCode).toBe(201);

      // In scope: read works.
      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(guest.token),
      });
      expect(read.statusCode).toBe(200);

      // Beyond scope 1: any write on the granted project → 403 read-only.
      const write = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}/settings`,
        headers: auth(guest.token),
        payload: { name: 'Guest rename attempt' },
      });
      expect(write.statusCode).toBe(403);
      expect((write.json() as { code: string }).code).toBe('PROJECT_ROLE_READ_ONLY');

      // Beyond scope 2: ANOTHER project of the same org — no grant, no access.
      const other = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/projects`,
        headers: auth(owner.token),
        payload: { name: 'Ungranted Project' },
      });
      const otherId = (other.json() as { project: { id: string } }).project.id;
      const outOfScope = await app.inject({
        method: 'GET',
        url: `/projects/${otherId}/files`,
        headers: auth(guest.token),
      });
      expect(outOfScope.statusCode).toBe(404);

      // Beyond scope 3: a guest cannot manage the ACL that admitted them.
      const escalate = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(guest.token),
        payload: { subjectType: 'USER', subjectUserId: guest.user.id, roleKey: 'editor' },
      });
      expect([403, 404]).toContain(escalate.statusCode);

      void store;
    });

    it('un grant expiré ne confère RIEN (403/404 après expiration)', async () => {
      const { app, owner, projectId } = await setup();
      const visitor = await register(app, 'expired@example.com', 'Expired Org');

      const grantRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: {
          subjectType: 'USER',
          subjectUserId: visitor.user.id,
          roleKey: 'viewer',
          expiresAt: new Date(Date.now() - 60_000).toISOString(), // déjà expiré
        },
      });
      expect(grantRes.statusCode).toBe(201);

      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(visitor.token),
      });
      expect(read.statusCode).toBe(404); // pas membre, grant expiré ⇒ le projet n'existe pas pour lui
    });

    it('une permission retirée = 403/404 : la révocation coupe l’accès immédiatement', async () => {
      const { app, owner, projectId } = await setup();
      const visitor = await register(app, 'revoked@example.com', 'Revoked Org');

      const grantRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: { subjectType: 'USER', subjectUserId: visitor.user.id, roleKey: 'viewer' },
      });
      const grantId = (grantRes.json() as { grant: { id: string } }).grant.id;

      // Access works while the grant is live…
      const before = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(visitor.token),
      });
      expect(before.statusCode).toBe(200);

      // …revoke it (explicit revocation path, not deletion)…
      const revoke = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}/access-grants/${grantId}`,
        headers: auth(owner.token),
      });
      expect(revoke.statusCode).toBe(200);
      expect((revoke.json() as { grant: { revokedAt?: string } }).grant.revokedAt).toBeTruthy();

      // …and the SAME call is now refused.
      const after = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(visitor.token),
      });
      expect(after.statusCode).toBe(404);
    });

    it('un groupe SCIM-managed refuse toute édition manuelle (409 GROUP_SCIM_MANAGED)', async () => {
      const { app, owner } = await setup();

      const groupRes = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups`,
        headers: auth(owner.token),
        payload: { name: 'engineering', scimManaged: true },
      });
      expect(groupRes.statusCode).toBe(201);
      const groupId = (groupRes.json() as { group: { id: string } }).group.id;

      const addMember = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups/${groupId}/members`,
        headers: auth(owner.token),
        payload: { userId: owner.user.id },
      });
      expect(addMember.statusCode).toBe(409);
      expect((addMember.json() as { code: string }).code).toBe('GROUP_SCIM_MANAGED');

      const del = await app.inject({
        method: 'DELETE',
        url: `/orgs/${owner.organization.id}/groups/${groupId}`,
        headers: auth(owner.token),
      });
      expect(del.statusCode).toBe(409);
    });

    it('cross-tenant : un membre d’une AUTRE org ne voit ni les groupes ni le projet', async () => {
      const { app, owner, projectId } = await setup();
      const outsider = await register(app, 'outsider@example.com', 'Other Org');

      const groups = await app.inject({
        method: 'GET',
        url: `/orgs/${owner.organization.id}/groups`,
        headers: auth(outsider.token),
      });
      expect(groups.statusCode).toBe(404);

      const project = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(outsider.token),
      });
      expect(project.statusCode).toBe(404);

      const grantAttempt = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(outsider.token),
        payload: { subjectType: 'USER', subjectUserId: outsider.user.id, roleKey: 'guest' },
      });
      expect(grantAttempt.statusCode).toBe(404);
    });

    it('un outsider ne peut pas recevoir un rôle plus large que guest/viewer', async () => {
      const { app, owner, projectId } = await setup();
      const outsider = await register(app, 'wide@example.com', 'Wide Org');

      const res = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: { subjectType: 'USER', subjectUserId: outsider.user.id, roleKey: 'editor' },
      });
      expect(res.statusCode).toBe(403);
      expect((res.json() as { code: string }).code).toBe('GRANT_OUTSIDER_ROLE_TOO_WIDE');
    });
  });

  describe('chemins positifs (et leur retrait)', () => {
    it('grant de GROUPE : accès via l’appartenance, coupé quand on quitte le groupe', async () => {
      const { store, app, owner, projectId } = await setup();
      const member = await register(app, 'grouped@example.com', 'Grouped Org');

      // The member joins owner's org (org role viewer — no write anywhere).
      await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'viewer' });

      const groupRes = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups`,
        headers: auth(owner.token),
        payload: { name: 'builders' },
      });
      const groupId = (groupRes.json() as { group: { id: string } }).group.id;

      const addRes = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups/${groupId}/members`,
        headers: auth(owner.token),
        payload: { userId: member.user.id },
      });
      expect(addRes.statusCode).toBe(201);

      const grantRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: { subjectType: 'GROUP', subjectGroupId: groupId, roleKey: 'editor' },
      });
      expect(grantRes.statusCode).toBe(201);

      // Via the group, the member can WRITE the project.
      const write = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}/settings`,
        headers: auth(member.token),
        payload: { name: 'Renamed via group grant' },
      });
      expect(write.statusCode).toBe(200);

      // Leaving the group removes the granted capability (viewer org role remains → read-only).
      const removeRes = await app.inject({
        method: 'DELETE',
        url: `/orgs/${owner.organization.id}/groups/${groupId}/members/${member.user.id}`,
        headers: auth(owner.token),
      });
      expect(removeRes.statusCode).toBe(204);

      const writeAfter = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}/settings`,
        headers: auth(member.token),
        payload: { name: 'Should fail now' },
      });
      expect(writeAfter.statusCode).toBe(403);
    });

    it('audit : création et révocation de grant laissent une trace', async () => {
      const { store, app, owner, projectId } = await setup();
      const visitor = await register(app, 'audited@example.com', 'Audited Org');

      const grantRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/access-grants`,
        headers: auth(owner.token),
        payload: { subjectType: 'USER', subjectUserId: visitor.user.id, roleKey: 'guest' },
      });
      const grantId = (grantRes.json() as { grant: { id: string } }).grant.id;

      await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}/access-grants/${grantId}`,
        headers: auth(owner.token),
      });

      const grant = await store.getAccessGrant(grantId);
      expect(grant?.grantedByUserId).toBe(owner.user.id);
      expect(grant?.revokedAt).toBeTruthy();
      expect(grant?.revokedByUserId).toBe(owner.user.id);
    });
  });
});
