/*
 * LIVE proof of the RECOVERY_WINDOW → RESTORING → ACTIVE leg (GCP-07), run
 * against the project soft-deleted by the P4 teardown proof. Uses the REAL
 * service (restoreFromRecoveryWindow → projects.undelete) and the same proof
 * database, so the binding's state machine is exercised end to end.
 *
 * Executed for real on 2026-07-17 against ecode-proof-b906ss (restore in
 * ~52 s, gcloud describe ACTIVE afterwards) — see
 * docs/deploy-evidence/2026-07-17-cloud-tenant-factory-iam/GCP-07-recovery-window.md.
 *
 * Usage: LIVE_PROOF=1 DATABASE_URL=… PROOF_BINDING_ID=… \
 *        tsx src/tests/cloud-governance-restore-proof.ts
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createDatabaseClient } from '@vibecore/database';
import { restoreFromRecoveryWindow } from '../cloud-project-factory.js';
import { PrismaCloudGovernanceStore } from '../cloud-governance-store.js';
import { RestGcpCloudClient } from '../gcp-cloud-client.js';

const EVIDENCE_FILE = process.env.PROOF_EVIDENCE_FILE ?? '/tmp/cloud-governance-restore-proof.jsonl';

function log(step: string, data: Record<string, unknown>): void {
  const entry = { at: new Date().toISOString(), step, ...data };
  appendFileSync(EVIDENCE_FILE, `${JSON.stringify(entry)}\n`);
  console.log(`[${entry.at}] ${step}`, JSON.stringify(data).slice(0, 300));
}

async function main(): Promise<void> {
  if (process.env.LIVE_PROOF !== '1') {
    console.log('Refusing to run without LIVE_PROOF=1.');
    process.exit(1);
  }

  const bindingId = process.env.PROOF_BINDING_ID;

  if (!bindingId) {
    throw new Error('PROOF_BINDING_ID is required');
  }

  const prisma = createDatabaseClient();
  const store = new PrismaCloudGovernanceStore(prisma);
  const gcp = new RestGcpCloudClient({
    getAccessToken: async () => execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim(),
  });

  const before = await store.getCloudProjectBinding(bindingId);

  if (!before) {
    throw new Error(`binding ${bindingId} not found`);
  }

  const gcpBefore = await gcp.getProject(before.gcpProjectId);
  log('restore.before', {
    bindingState: before.state,
    recoveryWindowEndsAt: before.recoveryWindowEndsAt?.toISOString(),
    gcpState: gcpBefore?.state,
  });

  const restored = await restoreFromRecoveryWindow(store, gcp, bindingId, 'restore-proof-harness');
  const gcpAfter = await gcp.getProject(before.gcpProjectId);
  const events = await store.listFactoryEvents(bindingId);

  log('restore.proven', {
    bindingState: restored.state,
    gcpState: gcpAfter?.state,
    recoveryWindowEndsAt: restored.recoveryWindowEndsAt,
    lastTransitions: events.slice(-3).map((e) => `${e.fromState}→${e.toState}`),
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  log('FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
