import { describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * F17: Team access-log route tests. A "team" is an organization in this
 * platform, so `/teams/:teamId/access-log` reuses the org AuditLog trail scoped
 * to the team/org id. These tests cover: listing scoped to the team, the CSV
 * export shape, and permission gating (view = org:read, export = audit:export,
 * non-members get 404).
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Team Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  const body = response.json() as { token: string; user: { id: string }; organization: { id: string } };

  return { token: body.token, userId: body.user.id, orgId: body.organization.id };
}

describe('F17 GET /teams/:teamId/access-log', () => {
  it('lists access-log entries scoped to the team and excludes other teams', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, 'owner-a@example.com', 'Team Alpha');
    const other = await register(app, 'owner-b@example.com', 'Team Beta');

    await store.recordAudit({
      organizationId: owner.orgId,
      actorUserId: owner.userId,
      action: 'member.add',
      resourceType: 'membership',
      resourceId: 'm-1',
      ipAddress: '203.0.113.7',
    });
    await store.recordAudit({
      organizationId: other.orgId,
      actorUserId: other.userId,
      action: 'member.add',
      resourceType: 'membership',
      resourceId: 'm-2',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log`,
      headers: auth(owner.token),
    });

    expect(res.statusCode).toBe(200);
    const entries = res.json().accessLog as Array<{ organizationId?: string; action: string; resourceId?: string }>;
    expect(entries.every((entry) => entry.organizationId === owner.orgId)).toBe(true);
    expect(entries.some((entry) => entry.action === 'member.add' && entry.resourceId === 'm-1')).toBe(true);
    expect(entries.some((entry) => entry.resourceId === 'm-2')).toBe(false);

    await app.close();
  });

  it('exports the team access log as CSV with the expected header and rows', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, 'owner-csv@example.com', 'Team CSV');
    await store.recordAudit({
      organizationId: owner.orgId,
      actorUserId: owner.userId,
      action: 'member.updateRole',
      resourceType: 'membership',
      resourceId: 'm-9',
      ipAddress: '198.51.100.4',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log/export?format=csv`,
      headers: auth(owner.token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('createdAt,organizationId,actorUserId,action,resourceType,resourceId,ipAddress');
    expect(lines.some((line) => line.includes('member.updateRole') && line.includes('198.51.100.4'))).toBe(true);

    // The export itself is audited on the team.
    const after = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log`,
      headers: auth(owner.token),
    });
    expect(after.json().accessLog.some((e: { action: string }) => e.action === 'team.access-log.export')).toBe(true);

    await app.close();
  });

  it('gates viewing on membership and export on audit:export', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const owner = await register(app, 'owner-gate@example.com', 'Team Gate');
    const member = await register(app, 'member-gate@example.com', 'Member Own Org');
    const outsider = await register(app, 'outsider-gate@example.com', 'Outsider Org');

    // A plain member of the team: has org:read (can view) but not audit:export.
    await store.addMember({ organizationId: owner.orgId, userId: member.userId, roleKey: 'member' });

    const memberList = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log`,
      headers: auth(member.token),
    });
    expect(memberList.statusCode).toBe(200);

    const memberExport = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log/export?format=csv`,
      headers: auth(member.token),
    });
    expect(memberExport.statusCode).toBe(403);

    // A non-member cannot even see that the team exists.
    const outsiderList = await app.inject({
      method: 'GET',
      url: `/teams/${owner.orgId}/access-log`,
      headers: auth(outsider.token),
    });
    expect(outsiderList.statusCode).toBe(404);

    // Unauthenticated request is rejected.
    const anon = await app.inject({ method: 'GET', url: `/teams/${owner.orgId}/access-log` });
    expect(anon.statusCode).toBe(401);

    await app.close();
  });
});
