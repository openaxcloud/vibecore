import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPhysicalPurgeProof } from '../../scripts/physical-purge-proof.js';

/*
 * The physical-erasure proof, replayed in CI. It re-runs the real erasure
 * orchestration against a throwaway test bucket/volume and asserts the committed
 * evidence artifact (docs/deploy-evidence/.../proof.json + SHA256SUMS) is exactly
 * reproducible — so the hashed proof can never silently drift from the code.
 */
const EVIDENCE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/deploy-evidence/2026-07-22-account-physical-purge',
);

describe('account physical-purge erasure proof (replayable)', () => {
  it('lists before > 0, erases, verifies 0 remaining', async () => {
    const bundle = await buildPhysicalPurgeProof();

    const objectsBefore = bundle.perProject.reduce((sum, r) => sum + r.objectsBefore, 0);
    const objectsRemaining = bundle.perProject.reduce((sum, r) => sum + r.objectsRemaining, 0);
    const volumesRemaining = bundle.perProject.reduce((sum, r) => sum + r.workspaceRemaining, 0);

    expect(objectsBefore).toBeGreaterThan(0);
    expect(objectsRemaining).toBe(0);
    expect(volumesRemaining).toBe(0);
    expect(bundle.proof.verifiedZeroRemaining).toBe(true);
    expect(bundle.proof.classes.map((c) => c.dataClass)).toEqual(['object_storage', 'workspace_volumes']);
  });

  it('reproduces the committed, hashed evidence artifact byte-for-byte', async () => {
    const bundle = await buildPhysicalPurgeProof();

    const committedProof = readFileSync(join(EVIDENCE_DIR, 'proof.json'), 'utf8').trimEnd();
    const committedSums = readFileSync(join(EVIDENCE_DIR, 'SHA256SUMS'), 'utf8').trim();

    expect(bundle.canonical).toBe(committedProof);
    expect(committedSums).toBe(`${bundle.sha256}  proof.json`);
  });
});
