/*
 * LIVE proof harness for the CloudTenant / Project Factory / Platform IAM
 * domain. Runs the REAL services (PrismaCloudGovernanceStore over a real
 * Postgres, RestGcpCloudClient over the real GCP control plane) and records
 * machine-checkable evidence for the contract's required negatives:
 *
 *   P2  two CloudTenants can never share a GCP project (service 409 + DB
 *       constraint refusal on a direct INSERT bypassing the service)
 *   E2E factory pipeline REQUESTED→ACTIVE on a real GCP project
 *   P5  RuntimeIdentity: two successive revisions → ONE service account
 *   P3  ownership transfer → the OLD principal is DENIED afterwards
 *       (live testIamPermissions before/after, revocation latency measured)
 *   P4  teardown → inventory, orphan detected while a resource survives,
 *       then erasure proof once the project is soft-deleted
 *
 * Executed for real on 2026-07-17 (project ecode-proof-b906ss) — see
 * docs/deploy-evidence/2026-07-17-cloud-tenant-factory-iam/. Re-running it
 * CREATES A REAL GCP PROJECT and spends quota; it is guarded by LIVE_PROOF=1
 * and needs explicit owner authorization.
 *
 * Usage (never in CI):
 *   LIVE_PROOF=1 DATABASE_URL=… PROOF_PARENT_FOLDER=folders/… \
 *   PROOF_BILLING_ACCOUNT=… tsx src/tests/cloud-governance-live-proof.ts
 *
 * Auth: the ambient gcloud user via `gcloud auth print-access-token`.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createDatabaseClient } from '@vibecore/database';
import {
  advanceCloudProjectBinding,
  executeTeardown,
  requestTeardown,
  verifyTeardown,
} from '../cloud-project-factory.js';
import { PrismaCloudGovernanceStore } from '../cloud-governance-store.js';
import { bindProjectToTenant, createCloudTenant, transferTenantOwnership } from '../cloud-tenant-service.js';
import { RestGcpCloudClient, type GcpTokenProvider } from '../gcp-cloud-client.js';
import { ensureRuntimeIdentity } from '../iam-identity-service.js';

const EVIDENCE_FILE = process.env.PROOF_EVIDENCE_FILE ?? '/tmp/cloud-governance-proof.jsonl';

function log(step: string, data: Record<string, unknown>): void {
  const entry = { at: new Date().toISOString(), step, ...data };
  appendFileSync(EVIDENCE_FILE, `${JSON.stringify(entry)}\n`);
  console.log(`[${entry.at}] ${step}`, JSON.stringify(data).slice(0, 400));
}

function gcloudToken(impersonate?: string): string {
  const args = ['auth', 'print-access-token'];

  if (impersonate) {
    args.push(`--impersonate-service-account=${impersonate}`);
  }

  return execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
}

const userTokens: GcpTokenProvider = { getAccessToken: async () => gcloudToken() };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(label: string, attempts: number, delayMs: number, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`  retry ${label} (${i + 1}/${attempts}): ${(error as Error).message.slice(0, 120)}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/** projects.testIamPermissions AS an arbitrary bearer (the denial probe). */
async function testIamPermissions(token: string, projectId: string, permissions: string[]): Promise<string[]> {
  const res = await fetch(`https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}:testIamPermissions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ permissions }),
  });
  const body = (await res.json()) as { permissions?: string[] };

  if (!res.ok) {
    throw new Error(`testIamPermissions ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }

  return body.permissions ?? [];
}

async function createBucket(projectId: string, name: string): Promise<void> {
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${gcloudToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, location: 'EU' }),
  });

  if (!res.ok) {
    throw new Error(`bucket create ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  if (process.env.LIVE_PROOF !== '1') {
    console.log('Refusing to run without LIVE_PROOF=1 (spends real GCP quota).');
    process.exit(1);
  }

  const parentFolder = process.env.PROOF_PARENT_FOLDER;
  const billingAccountId = process.env.PROOF_BILLING_ACCOUNT;

  if (!parentFolder || !billingAccountId) {
    throw new Error('PROOF_PARENT_FOLDER and PROOF_BILLING_ACCOUNT are required');
  }

  const prisma = createDatabaseClient();
  const store = new PrismaCloudGovernanceStore(prisma);
  const gcp = new RestGcpCloudClient(userTokens);

  const suffix = Math.random().toString(36).slice(2, 8);
  const projectId = `ecode-proof-${suffix}`;

  log('start', { projectId, parentFolder, evidence: EVIDENCE_FILE });

  /* ── P2: two tenants can never share a project ─────────────────────────── */
  const oldOwnerSaName = `proof-owner-old-${suffix}`;
  const tenantA = await createCloudTenant(store, {
    customerBoundaryType: 'PERSON',
    // The tenant owner is a real SA we create inside the project below, so
    // the post-transfer denial can be proven with real impersonated calls.
    ownerPrincipalId: `serviceAccount:${oldOwnerSaName}@${projectId}.iam.gserviceaccount.com`,
    billingPrincipalId: 'user:groupequaliwatt@gmail.com',
  });
  const tenantB = await createCloudTenant(store, {
    customerBoundaryType: 'WORKSPACE',
    ownerPrincipalId: 'user:someone-else@example.com',
    billingPrincipalId: 'user:someone-else@example.com',
  });

  const binding = await bindProjectToTenant(store, {
    cloudTenantId: tenantA.id,
    gcpProjectId: projectId,
    region: 'europe-west9',
    parentFolderId: parentFolder,
  });
  log('p2.bound', { tenantA: tenantA.id, binding: binding.id, projectId });

  let p2ServiceRefusal: unknown = null;

  try {
    await bindProjectToTenant(store, {
      cloudTenantId: tenantB.id,
      gcpProjectId: projectId,
      region: 'europe-west9',
    });
  } catch (error) {
    p2ServiceRefusal = { code: (error as { code?: string }).code, message: (error as Error).message };
  }

  if (!p2ServiceRefusal || (p2ServiceRefusal as { code?: string }).code !== 'TENANT_PROJECT_CONFLICT') {
    throw new Error('P2 FAILED: second tenant was not refused by the service');
  }

  let p2DbRefusal: unknown = null;

  try {
    // Bypass the service entirely: the DB constraint must still hold.
    await prisma.cloudProjectBinding.create({
      data: {
        cloudTenantId: tenantB.id,
        gcpProjectId: projectId,
        role: 'PRIMARY',
        region: 'europe-west9',
      },
    });
  } catch (error) {
    p2DbRefusal = { prismaCode: (error as { code?: string }).code, message: (error as Error).message.slice(0, 200) };
  }

  if (!p2DbRefusal || (p2DbRefusal as { prismaCode?: string }).prismaCode !== 'P2002') {
    throw new Error('P2 FAILED: direct INSERT bypassing the service was not refused by the DB constraint');
  }

  log('p2.proven', { serviceRefusal: p2ServiceRefusal, dbRefusal: p2DbRefusal });

  /* ── Factory E2E: REQUESTED→ACTIVE on the real control plane ───────────── */
  const advanceOpts = {
    billingAccountId,
    parent: parentFolder,
    services: ['iamcredentials.googleapis.com'],
    actor: 'live-proof-harness',
  };

  const advanceTo = async (targets: string[]): Promise<void> => {
    for (const target of targets) {
      const advanced = await retry(`advance→${target}`, 20, 6000, () =>
        advanceCloudProjectBinding(store, gcp, binding.id, advanceOpts),
      );
      log('factory.advanced', { state: advanced.state, gcpProjectNumber: advanced.gcpProjectNumber });

      if (advanced.state !== target) {
        throw new Error(`factory advanced to ${advanced.state}, expected ${target}`);
      }
    }
  };

  await advanceTo(['CREATING', 'BILLING_LINKED', 'APIS_ENABLING', 'SERVICE_AGENTS_READY']);

  /*
   * The IAM_BOUND step grants roles/viewer to the tenant OWNER — which is a
   * service account inside this very project. Create it (and the future new
   * owner) now that the IAM API is enabled, then finish the pipeline.
   */
  const oldOwner = await retry('create old-owner SA', 15, 6000, () =>
    gcp.createServiceAccount(projectId, oldOwnerSaName, 'proof old owner'),
  );
  const newOwner = await gcp.createServiceAccount(projectId, `proof-owner-new-${suffix}`, 'proof new owner');

  await advanceTo(['IAM_BOUND', 'EDGE_READY', 'ACTIVE']);

  const liveProject = await gcp.getProject(projectId);
  log('factory.active', { liveProject });

  /* ── P5: RuntimeIdentity reused across two successive revisions ────────── */
  const sasBefore = await gcp.listServiceAccounts(projectId);

  const revision1 = await retry('ensureRuntimeIdentity#1', 10, 6000, () =>
    ensureRuntimeIdentity(store, gcp, {
      app: 'demo-app',
      environment: 'production',
      privilegeBoundary: 'app-runtime',
      gcpProjectId: projectId,
    }),
  );
  const revision2 = await ensureRuntimeIdentity(store, gcp, {
    app: 'demo-app',
    environment: 'production',
    privilegeBoundary: 'app-runtime',
    gcpProjectId: projectId,
  });
  const sasAfter = await gcp.listServiceAccounts(projectId);

  const runtimeSas = sasAfter.filter((sa) => sa.email.startsWith('rt-'));

  if (!revision1.created || revision2.created || runtimeSas.length !== 1) {
    throw new Error(
      `P5 FAILED: created1=${revision1.created} created2=${revision2.created} runtimeSaCount=${runtimeSas.length}`,
    );
  }

  log('p5.proven', {
    identity: revision1.identity.gcpServiceAccountEmail,
    revision1Created: revision1.created,
    revision2Created: revision2.created,
    revisionsServed: revision2.identity.revisionsServed,
    serviceAccountsBefore: sasBefore.map((s) => s.email),
    serviceAccountsAfter: sasAfter.map((s) => s.email),
  });

  /* ── P3: transfer revokes the old principal — proven by live denial ────── */
  const oldPrincipal = `serviceAccount:${oldOwner.email}`;
  const newPrincipal = `serviceAccount:${newOwner.email}`;

  // Give the OLD owner real rights on the project (what a tenant owner holds).
  const policy = await gcp.getProjectIamPolicy(projectId);
  policy.bindings = [
    ...(policy.bindings ?? []),
    { role: 'roles/storage.admin', members: [oldPrincipal] },
    { role: 'roles/viewer', members: [oldPrincipal] },
  ];
  await gcp.setProjectIamPolicy(projectId, policy);

  // Let me impersonate the old owner so the denial is a REAL observed call.
  const me = 'user:groupequaliwatt@gmail.com';
  const saPolicyRes = await fetch(
    `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${oldOwner.email}:setIamPolicy`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${gcloudToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        policy: { bindings: [{ role: 'roles/iam.serviceAccountTokenCreator', members: [me] }] },
      }),
    },
  );

  if (!saPolicyRes.ok) {
    throw new Error(`tokenCreator grant failed: ${saPolicyRes.status} ${(await saPolicyRes.text()).slice(0, 200)}`);
  }

  const probePermissions = ['storage.buckets.list', 'resourcemanager.projects.get'];
  const beforePermissions = await retry('probe as old owner (before)', 30, 10000, async () => {
    const token = gcloudToken(oldOwner.email);
    const held = await testIamPermissions(token, projectId, probePermissions);

    if (held.length === 0) {
      throw new Error('IAM grant not propagated yet');
    }

    return held;
  });
  log('p3.before', { oldPrincipal, heldPermissions: beforePermissions });

  const revokeStartedAt = Date.now();
  const transferResult = await transferTenantOwnership(store, gcp, {
    cloudTenantId: tenantA.id,
    toPrincipalId: newPrincipal,
    grantRoles: ['roles/viewer'],
  });
  log('p3.transferred', {
    transferId: transferResult.transfer.id,
    state: transferResult.transfer.state,
    revokeEvidence: transferResult.transfer.revokeEvidence,
    regrantEvidence: transferResult.transfer.regrantEvidence,
    ownerAfter: transferResult.tenant.ownerPrincipalId,
    ownershipVersion: transferResult.tenant.ownershipVersion,
  });

  // THE denial: the old principal, probed live, holds nothing anymore.
  const afterPermissions = await retry('probe as old owner (after)', 30, 10000, async () => {
    const token = gcloudToken(oldOwner.email);
    const held = await testIamPermissions(token, projectId, probePermissions);

    if (held.length > 0) {
      throw new Error(`old principal still holds ${held.join(', ')}`);
    }

    return held;
  });
  const revocationLatencySeconds = Math.round((Date.now() - revokeStartedAt) / 1000);

  const policyAfter = await gcp.getProjectIamPolicy(projectId);
  const oldStillListed = (policyAfter.bindings ?? []).some((b) => b.members.includes(oldPrincipal));

  if (oldStillListed) {
    throw new Error('P3 FAILED: old principal still listed in the IAM policy');
  }

  log('p3.proven', {
    afterPermissions,
    revocationLatencySeconds,
    oldPrincipalInPolicyAfter: oldStillListed,
    newOwnerGrantedRoles: ['roles/viewer'],
  });

  /* ── P4: teardown — orphan detection first, then erasure proof ─────────── */
  const bucketName = `ecode-proof-data-${suffix}`;
  await retry('create data bucket', 10, 6000, () => createBucket(projectId, bucketName));

  const { teardown } = await requestTeardown(store, gcp, binding.id, 'live-proof-harness');
  log('p4.inventory', { teardownId: teardown.id, inventory: teardown.resourceInventory });

  // Verify while everything still exists: the harness must SEE the orphans.
  const withOrphans = await verifyTeardown(store, gcp, teardown.id);

  if (withOrphans.teardown.status !== 'ORPHANS_DETECTED' || withOrphans.orphans.length === 0) {
    throw new Error(`P4 FAILED: expected orphans before deletion, got ${withOrphans.teardown.status}`);
  }

  log('p4.orphans_detected', {
    status: withOrphans.teardown.status,
    orphans: withOrphans.orphans,
    projectState: withOrphans.projectState,
  });

  const afterTeardown = await executeTeardown(store, gcp, binding.id, 'live-proof-harness');
  log('p4.executed', {
    state: afterTeardown.state,
    recoveryWindowEndsAt: afterTeardown.recoveryWindowEndsAt?.toISOString(),
  });

  const finalVerification = await retry('verify erasure', 20, 6000, async () => {
    const v = await verifyTeardown(store, gcp, teardown.id);

    if (v.teardown.status !== 'COMPLETE') {
      throw new Error(`teardown still ${v.teardown.status}`);
    }

    return v;
  });

  log('p4.proven', {
    status: finalVerification.teardown.status,
    erasureProof: finalVerification.teardown.erasureProof,
    projectState: finalVerification.projectState,
  });

  log('done', {
    summary: {
      p2_sharedProjectRefused: true,
      factory_activeReached: true,
      p5_runtimeIdentityReused: true,
      p3_oldOwnerDeniedAfterTransfer: true,
      p3_revocationLatencySeconds: revocationLatencySeconds,
      p4_orphanDetectedThenErasureProven: true,
      gcpProjectId: projectId,
    },
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  log('FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
