/*
 * LIVE proof pour l'enforcement des AccessGrants sur les ressources NON-projet
 * (P0-EX-07 : ARTIFACT | DEPLOYMENT | DATASET) : rejoue les négatifs à travers
 * la VRAIE API (buildApiApp) adossée au VRAI PrismaApiStore sur un VRAI
 * Postgres (DATABASE_URL), pas le double in-memory. Chaque check est un appel
 * HTTP réel, suivi quand c'est pertinent d'une lecture directe des lignes DB.
 *
 * Proofs:
 *   R1 grant DEPLOYMENT : la ressource accordée 200 ; sœur 404 ; projet parent
 *      404 ; liste 404
 *   R2 grant expiré ⇒ 404
 *   R3 révocation : 200 avant, même appel 404 après ; ligne DB revokedAt posée
 *   R4 cross-tenant : grant forgé dans une autre org ⇒ 404
 *   R5 guest via grant : lecture 200, écriture 403 PROJECT_ROLE_READ_ONLY
 *   R6 élévation bornée : membre org viewer + grant editor ⇒ écrit SA
 *      ressource (200), pas la sœur (403)
 *   R7 liaison ressource↔projet : grant vers la ressource d'un autre projet
 *      refusé (404 RESOURCE_NOT_FOUND)
 *   R8 DATASET : sans grant 404 ; grant viewer ⇒ panneau 200 mais écriture 403
 *
 * Usage: LIVE_PROOF=1 DATABASE_URL=postgresql://…/resource_grants_proof \
 *        tsx src/tests/resource-grants-live-proof.ts
 */

import { appendFileSync } from 'node:fs';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';

const EVIDENCE_FILE = process.env.PROOF_EVIDENCE_FILE ?? '/tmp/resource-grants-proof.jsonl';

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

  // R8 (DATASET) passe par les routes /database, dormantes derrière ce flag.
  process.env.DB_ROLLBACK_ENABLED = 'true';

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

  const owner = await register(`owner-${suffix}@proof.local`, `RG Org ${suffix}`);
  const outsider = await register(`outsider-${suffix}@proof.local`, `RG Outsider ${suffix}`);
  const guest = await register(`guest-${suffix}@proof.local`, `RG Guest ${suffix}`);
  const member = await register(`member-${suffix}@proof.local`, `RG Member ${suffix}`);

  const projectRes = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/projects`,
    headers: auth(owner.token),
    payload: { name: `RG Project ${suffix}` },
  });
  expectEqual('create project', projectRes.statusCode, 201);

  const projectId = (projectRes.json() as { project: { id: string } }).project.id;
  const otherProjectRes = await app.inject({
    method: 'POST',
    url: `/orgs/${owner.organization.id}/projects`,
    headers: auth(owner.token),
    payload: { name: `RG Other ${suffix}` },
  });
  const otherProjectId = (otherProjectRes.json() as { project: { id: string } }).project.id;

  // Ressources réelles en DB (lignes Deployment) — pas de mock.
  const granted = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });
  const sibling = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });
  const foreign = await store.createDeployment({ projectId: otherProjectId, provider: 'static', status: 'READY' });

  log('setup', {
    projectId,
    otherProjectId,
    grantedDeploymentId: granted.id,
    siblingDeploymentId: sibling.id,
    db: 'real Prisma/Postgres (resource_grants_proof)',
  });

  const createGrant = (targetProjectId: string, token: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/projects/${targetProjectId}/access-grants`,
      headers: auth(token),
      payload,
    });

  /* R1 — grant DEPLOYMENT : SA ressource seule */
  const r1Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: outsider.user.id,
    roleKey: 'viewer',
    resourceType: 'DEPLOYMENT',
    resourceId: granted.id,
  });
  expectEqual('r1 grant created', r1Grant.statusCode, 201);

  const r1Granted = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${granted.id}`,
    headers: auth(outsider.token),
  });
  const r1Sibling = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${sibling.id}`,
    headers: auth(outsider.token),
  });
  const r1Project = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/files`,
    headers: auth(outsider.token),
  });
  const r1List = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments`,
    headers: auth(outsider.token),
  });
  expectEqual('r1 granted readable', r1Granted.statusCode, 200);
  expectEqual('r1 sibling refused', r1Sibling.statusCode, 404);
  expectEqual('r1 parent project refused', r1Project.statusCode, 404);
  expectEqual('r1 list refused', r1List.statusCode, 404);
  log('r1.single_resource.proven', {
    granted: r1Granted.statusCode,
    sibling: r1Sibling.statusCode,
    parentProject: r1Project.statusCode,
    list: r1List.statusCode,
  });

  /* R2 — grant expiré */
  const r2Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: guest.user.id,
    roleKey: 'viewer',
    resourceType: 'DEPLOYMENT',
    resourceId: sibling.id,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  expectEqual('r2 expired grant created', r2Grant.statusCode, 201);

  const r2Read = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${sibling.id}`,
    headers: auth(guest.token),
  });
  expectEqual('r2 expired confers nothing', r2Read.statusCode, 404);
  log('r2.expired.proven', { readRefused: r2Read.statusCode });

  /* R3 — révocation : même appel 200 → 404, ligne DB revokedAt */
  const r3Before = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${granted.id}`,
    headers: auth(outsider.token),
  });
  const r1GrantId = (r1Grant.json() as { grant: { id: string } }).grant.id;
  const r3Revoke = await app.inject({
    method: 'DELETE',
    url: `/projects/${projectId}/access-grants/${r1GrantId}`,
    headers: auth(owner.token),
  });
  const r3After = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${granted.id}`,
    headers: auth(outsider.token),
  });
  expectEqual('r3 before revoke', r3Before.statusCode, 200);
  expectEqual('r3 revoke call', r3Revoke.statusCode, 200);
  expectEqual('r3 after revoke', r3After.statusCode, 404);

  const r3Row = await store.getAccessGrant(r1GrantId);
  log('r3.revocation.proven', {
    before: r3Before.statusCode,
    after: r3After.statusCode,
    dbRow: { revokedAt: r3Row?.revokedAt, revokedByUserId: r3Row?.revokedByUserId },
  });

  /* R4 — cross-tenant : grant forgé dans une AUTRE org */
  await store.createAccessGrant({
    organizationId: outsider.organization.id,
    subjectType: 'USER',
    subjectUserId: outsider.user.id,
    resourceType: 'DEPLOYMENT',
    resourceId: granted.id,
    roleKey: 'editor',
  });

  const r4Read = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${granted.id}`,
    headers: auth(outsider.token),
  });
  expectEqual('r4 cross-tenant forged grant refused', r4Read.statusCode, 404);
  log('r4.cross_tenant.proven', { readRefused: r4Read.statusCode });

  /* R5 — guest via grant : lecture 200, écriture 403 */
  const queued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
  const r5Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: guest.user.id,
    roleKey: 'guest',
    resourceType: 'DEPLOYMENT',
    resourceId: queued.id,
  });
  expectEqual('r5 guest grant created', r5Grant.statusCode, 201);

  const r5Read = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/deployments/${queued.id}`,
    headers: auth(guest.token),
  });
  const r5Write = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${queued.id}/cancel`,
    headers: auth(guest.token),
  });
  expectEqual('r5 guest read in scope', r5Read.statusCode, 200);
  expectEqual('r5 guest write refused', r5Write.statusCode, 403);
  expectEqual('r5 write code', (r5Write.json() as { code?: string }).code, 'PROJECT_ROLE_READ_ONLY');
  log('r5.guest_readonly.proven', {
    read: r5Read.statusCode,
    write: r5Write.statusCode,
    writeCode: (r5Write.json() as { code?: string }).code,
  });

  /* R6 — élévation bornée : membre org viewer + grant editor */
  await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'viewer' });

  const elevated = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
  const siblingQueued = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
  const r6Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: member.user.id,
    roleKey: 'editor',
    resourceType: 'DEPLOYMENT',
    resourceId: elevated.id,
  });
  expectEqual('r6 editor grant created', r6Grant.statusCode, 201);

  const r6Write = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${elevated.id}/cancel`,
    headers: auth(member.token),
  });
  const r6SiblingWrite = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/${siblingQueued.id}/cancel`,
    headers: auth(member.token),
  });
  expectEqual('r6 write on granted resource', r6Write.statusCode, 200);
  expectEqual('r6 write on sibling refused', r6SiblingWrite.statusCode, 403);
  log('r6.bounded_elevation.proven', { granted: r6Write.statusCode, sibling: r6SiblingWrite.statusCode });

  /* R7 — liaison ressource↔projet à la création */
  const r7Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: outsider.user.id,
    roleKey: 'viewer',
    resourceType: 'DEPLOYMENT',
    resourceId: foreign.id,
  });
  expectEqual('r7 foreign resource refused', r7Grant.statusCode, 404);
  expectEqual('r7 code', (r7Grant.json() as { code?: string }).code, 'RESOURCE_NOT_FOUND');
  log('r7.binding.proven', { statusCode: r7Grant.statusCode, code: (r7Grant.json() as { code?: string }).code });

  /* R8 — DATASET : instance managée réelle en DB */
  const instance = await store.createDatabaseInstance({
    projectId,
    organizationId: owner.organization.id,
    retentionDays: 7,
  });
  const r8None = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/database`,
    headers: auth(outsider.token),
  });
  const r8Grant = await createGrant(projectId, owner.token, {
    subjectType: 'USER',
    subjectUserId: outsider.user.id,
    roleKey: 'viewer',
    resourceType: 'DATASET',
    resourceId: instance.id,
  });
  expectEqual('r8 dataset grant created', r8Grant.statusCode, 201);

  const r8Read = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/database`,
    headers: auth(outsider.token),
  });
  const r8Write = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/database/snapshots`,
    headers: auth(outsider.token),
    payload: { label: 'viewer write attempt' },
  });
  expectEqual('r8 no grant refused', r8None.statusCode, 404);
  expectEqual('r8 granted panel readable', r8Read.statusCode, 200);
  expectEqual('r8 write refused', r8Write.statusCode, 403);
  expectEqual('r8 write code', (r8Write.json() as { code?: string }).code, 'PROJECT_ROLE_READ_ONLY');
  log('r8.dataset.proven', {
    withoutGrant: r8None.statusCode,
    read: r8Read.statusCode,
    write: r8Write.statusCode,
    instanceId: instance.id,
  });

  log('done', {
    summary: {
      r1_singleResourceOnly: true,
      r2_expiredGrantRefused: true,
      r3_revocationCutsAccess: true,
      r4_crossTenantForgedGrantRefused: true,
      r5_guestGrantReadOnly: true,
      r6_boundedElevation: true,
      r7_resourceProjectBindingEnforced: true,
      r8_datasetGrantScoped: true,
      store: 'PrismaApiStore (real Postgres)',
    },
  });

  await app.close();
}

main().catch((error) => {
  log('FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
