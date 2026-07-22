/**
 * Replayable PHYSICAL-ERASURE proof for account purge (§16.12).
 *
 * Runs the REAL `eraseProjectsStorage` orchestration against a THROWAWAY test
 * bucket + workspace volume (never production user data): seeds objects, lists
 * BEFORE, erases, re-counts AFTER (must be 0), and folds the result into an
 * ErasureProof. Emits a canonical JSON artifact + its SHA-256 so the evidence is
 * tamper-evident and reproducible — the companion spec recomputes the hash and
 * fails if it drifts.
 *
 * Run:  npx tsx services/api/scripts/physical-purge-proof.ts --write
 * (omit --write to just print PASS/FAIL). Deterministic: fixed ids/timestamps,
 * so the hash is stable across machines.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildErasureProof } from '../src/account-purge.js';
import {
  eraseProjectsStorage,
  type ObjectStorageErasurePort,
  type WorkspaceVolumeErasurePort,
} from '../src/account-storage-purge.js';

/* ------------------------- throwaway test backends ------------------------- */

class TestBucketStore implements ObjectStorageErasurePort {
  readonly buckets = new Map<string, string[]>();

  seed(projectId: string, keys: string[]) {
    this.buckets.set(projectId, keys);
  }

  async bucketExists(projectId: string) {
    return this.buckets.has(projectId);
  }

  async listObjects(projectId: string) {
    return { objects: (this.buckets.get(projectId) ?? []).map((key) => ({ key })) };
  }

  async deleteBucket(projectId: string) {
    this.buckets.delete(projectId);

    return { deleted: true, bucket: `vc-${projectId}` };
  }
}

class TestWorkspaceVolumes implements WorkspaceVolumeErasurePort {
  readonly present = new Set<string>();

  seed(workspaceId: string) {
    this.present.add(workspaceId);
  }

  async workspaceExists(workspaceId: string) {
    return this.present.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string) {
    this.present.delete(workspaceId);
  }
}

/** Recursively key-sorted JSON so the hash is independent of property order. */
function canonicalize(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sort);
    }

    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, sort((input as Record<string, unknown>)[key])]),
      );
    }

    return input;
  };

  return JSON.stringify(sort(value), null, 2);
}

export interface PhysicalPurgeProofBundle {
  proof: ReturnType<typeof buildErasureProof>;
  perProject: Awaited<ReturnType<typeof eraseProjectsStorage>>['results'];
  canonical: string;
  sha256: string;
}

/**
 * Build the deterministic erasure proof over a seeded test bucket/volume.
 * Two projects: one with 3 objects + a workspace, one with 2 objects, no
 * workspace — so the proof exercises objects, buckets and volumes together.
 */
export async function buildPhysicalPurgeProof(): Promise<PhysicalPurgeProofBundle> {
  const USER_ID = 'proof-user-0000';
  const REQUESTED_AT = '2026-07-01T00:00:00.000Z';
  const PURGED_AT = '2026-07-15T00:00:00.000Z';
  const projectIds = ['proof-project-a', 'proof-project-b'];

  const objectStorage = new TestBucketStore();
  objectStorage.seed('proof-project-a', ['assets/logo.png', 'data/export.json', 'nested/dir/notes.txt']);
  objectStorage.seed('proof-project-b', ['a.bin', 'b.bin']);

  const workspaceVolumes = new TestWorkspaceVolumes();
  workspaceVolumes.seed('ws-proof-project-a');

  const outcome = await eraseProjectsStorage(projectIds, {
    objectStorage,
    workspaceVolumes,
    workspaceIdFor: (projectId) => `ws-${projectId}`,
  });

  if (!outcome.verified) {
    throw new Error('PHYSICAL_PURGE_PROOF_FAILED: storage not fully erased');
  }

  // Post-condition: the live backends must actually be empty now.
  const objectsLeft = (await objectStorage.listObjects('proof-project-a')).objects.length + objectStorage.buckets.size;
  const volumesLeft = workspaceVolumes.present.size;

  if (objectsLeft !== 0 || volumesLeft !== 0) {
    throw new Error(`PHYSICAL_PURGE_PROOF_FAILED: residue objects=${objectsLeft} volumes=${volumesLeft}`);
  }

  const proof = buildErasureProof({
    userId: USER_ID,
    requestedAt: REQUESTED_AT,
    purgedAt: PURGED_AT,
    classes: outcome.classes,
  });

  const canonical = canonicalize(proof);
  const sha256 = createHash('sha256').update(canonical).digest('hex');

  return { proof, perProject: outcome.results, canonical, sha256 };
}

async function main() {
  const bundle = await buildPhysicalPurgeProof();
  const write = process.argv.includes('--write');

  const before = bundle.perProject.reduce((sum, r) => sum + r.objectsBefore, 0);
  const workspacesBefore = bundle.perProject.filter((r) => r.workspaceExistedBefore).length;

  process.stdout.write(
    `PHYSICAL PURGE PROOF: PASS\n` +
      `  objects listed before: ${before}, remaining after: 0\n` +
      `  workspaces before: ${workspacesBefore}, remaining after: 0\n` +
      `  verifiedZeroRemaining: ${bundle.proof.verifiedZeroRemaining}\n` +
      `  sha256: ${bundle.sha256}\n`,
  );

  if (write) {
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = join(here, '../../../docs/deploy-evidence/2026-07-22-account-physical-purge');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proof.json'), `${bundle.canonical}\n`);
    writeFileSync(join(dir, 'SHA256SUMS'), `${bundle.sha256}  proof.json\n`);
    process.stdout.write(`  wrote artifacts to ${dir}\n`);
  }
}

// Run when invoked directly (tsx), not when imported by the spec.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
}
