/*
 * LIVE proof for IDENTITY_COLLABORATION (P0-EX-07): replays the contract's
 * negatives through the REAL API (buildApiApp) backed by the REAL
 * PrismaApiStore over a REAL Postgres (DATABASE_URL), not the in-memory test
 * double. Every check is an HTTP call followed, where relevant, by a direct
 * SQL-level look at the rows.
 *
 * Proofs:
 *   N1 guest beyond scope: read granted project 200, write 403, other project 404
 *   N2 expired grant confers nothing (404)
 *   N3 revoked grant: 200 before, revocation, SAME call 404 after
 *   N4 SCIM-managed group refuses manual edits (409)
 *   N5 cross-tenant outsider: groups 404, project 404
 *
 * Usage: LIVE_PROOF=1 DATABASE_URL=postgresql://…/identity_proof \
 *        tsx src/tests/identity-collaboration-live-proof.ts
 */

import { appendFileSync } from 'node:fs';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';

const EVIDENCE_FILE = process.env.PROOF_EVIDENCE_FILE ?? '/tmp/identity-collaboration-proof.jsonl';

function log(step: string, data: Record<string, unknown>): void {
  const entry = { at: new Date().toISOString(), step, ...data };
  appendFileSync(EVIDENCE_FILE, `${JSON.stringify(entry)}\n`);
  console.log(`[${entry.at}] ${step}`, JSON.stringify(data).slice(0, 300));
}

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main(): Promise<void> {
  if (process.env.LIVE_PROOF !== '1') {
    console.log('Refusing to run without LIVE_PROOF=1.');
    process.exit(1);
  }

  process.env.OAUTH_STATE_SECRET ??= 'live-proof-state-secret';
  process.env.ENCRYPTION_SECRET ??= 'live-proof-encryption-secret';

  const store = new PrismaApiStore();
  const app = await buildApiApp({ store });
  const suffix = Math.random().toString(36).slice(2, 8);

  const register = async (email: string, organizationName: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: 'Live Proof', organizationName },
    });
    expectEqual(`register ${email}`, res.statusCode, 201);

    return res.json() as { token: string; user: { id: string }; organization: { id: string } };
  };

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const owner = await register(`owner-${suffix}@proof.local`, `Proof Org ${suffix}`);
  const guest = await register(`guest-${suffix}@proof.local`, `Guest Org ${suffix}`);
  const outsider = await register(`outsider-${suffix}@proof.local`, `Outsider Org ${suffix}`);

  const projectRes = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/projects`,
    headers: auth(owner.token),
    payload: { name: `Proof Project ${suffix}` },
  });
  expectEqual('create project', projectRes.statusCode, 201);

  const projectId = (projectRes.json() as { project: { id: string } }).project.id;
  const otherRes = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/projects`,
    headers: auth(owner.token),
    payload: { name: `Ungranted ${suffix}` },
  });
  const otherProjectId = (otherRes.json() as { project: { id: string } }).project.id;

  log('setup', { projectId, otherProjectId, db: 'real Prisma/Postgres (identity_proof)' });

  /* N1 — guest beyond scope */
  const grantRes = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/access-grants`,
    headers: auth(owner.token),
    payload: { subjectType: 'USER', subjectUserId: guest.user.id, roleKey: 'guest' },
  });
  expectEqual('guest grant', grantRes.statusCode, 201);

  const guestRead = await app.inject({ method: 'GET', url: `/projects/${projectId}/files`, headers: auth(guest.token) });
  const guestWrite = await app.inject({
    method: 'PATCH',
    url: `/projects/${projectId}/settings`,
    headers: auth(guest.token),
    payload: { name: 'guest write attempt' },
  });
  const guestOther = await app.inject({
    method: 'GET',
    url: `/projects/${otherProjectId}/files`,
    headers: auth(guest.token),
  });
  expectEqual('guest read in scope', guestRead.statusCode, 200);
  expectEqual('guest write refused', guestWrite.statusCode, 403);
  expectEqual('guest other project refused', guestOther.statusCode, 404);
  log('n1.guest_scope.proven', {
    readInScope: guestRead.statusCode,
    writeRefused: guestWrite.statusCode,
    writeCode: (guestWrite.json() as { code?: string }).code,
    otherProjectRefused: guestOther.statusCode,
  });

  /* N2 — expired grant */
  const expiredGrant = await app.inject({
    method: 'POST',
    url: `/projects/${otherProjectId}/access-grants`,
    headers: auth(owner.token),
    payload: {
      subjectType: 'USER',
      subjectUserId: guest.user.id,
      roleKey: 'viewer',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
  });
  expectEqual('expired grant created', expiredGrant.statusCode, 201);

  const expiredRead = await app.inject({
    method: 'GET',
    url: `/projects/${otherProjectId}/files`,
    headers: auth(guest.token),
  });
  expectEqual('expired grant confers nothing', expiredRead.statusCode, 404);
  log('n2.expired.proven', { readRefused: expiredRead.statusCode });

  /* N3 — revocation cuts access */
  const liveGrant = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/access-grants`,
    headers: auth(owner.token),
    payload: { subjectType: 'USER', subjectUserId: outsider.user.id, roleKey: 'viewer' },
  });
  const liveGrantId = (liveGrant.json() as { grant: { id: string } }).grant.id;

  const beforeRevoke = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/files`,
    headers: auth(outsider.token),
  });
  const revokeRes = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}/access-grants/${liveGrantId}`,
    headers: auth(owner.token),
  });
  const afterRevoke = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/files`,
    headers: auth(outsider.token),
  });
  expectEqual('access before revoke', beforeRevoke.statusCode, 200);
  expectEqual('revoke call', revokeRes.statusCode, 200);
  expectEqual('access after revoke', afterRevoke.statusCode, 404);

  const revokedRow = await store.getAccessGrant(liveGrantId);
  log('n3.revocation.proven', {
    before: beforeRevoke.statusCode,
    after: afterRevoke.statusCode,
    dbRow: { revokedAt: revokedRow?.revokedAt, revokedByUserId: revokedRow?.revokedByUserId },
  });

  /* N4 — SCIM-managed group refuses manual edits */
  const scimGroup = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/groups`,
    headers: auth(owner.token),
    payload: { name: `scim-${suffix}`, scimManaged: true },
  });
  const scimGroupId = (scimGroup.json() as { group: { id: string } }).group.id;
  const scimEdit = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/groups/${scimGroupId}/members`,
    headers: auth(owner.token),
    payload: { userId: owner.user.id },
  });
  expectEqual('scim manual edit refused', scimEdit.statusCode, 409);
  log('n4.scim.proven', { editRefused: scimEdit.statusCode, code: (scimEdit.json() as { code?: string }).code });

  /* N5 — cross-tenant */
  const crossGroups = await app.inject({
    method: 'GET',
    url: `/orgs/${owner.organization.id}/groups`,
    headers: auth(outsider.token),
  });
  const crossProject = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/files`,
    headers: auth(outsider.token),
  });
  expectEqual('cross-tenant groups refused', crossGroups.statusCode, 404);
  expectEqual('cross-tenant project refused (post-revoke)', crossProject.statusCode, 404);
  log('n5.cross_tenant.proven', { groups: crossGroups.statusCode, project: crossProject.statusCode });

  log('done', {
    summary: {
      n1_guestScope: true,
      n2_expiredGrantRefused: true,
      n3_revocationCutsAccess: true,
      n4_scimManualEditRefused: true,
      n5_crossTenantRefused: true,
      store: 'PrismaApiStore (real Postgres)',
    },
  });

  await app.close();
}

main().catch((error) => {
  log('FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
