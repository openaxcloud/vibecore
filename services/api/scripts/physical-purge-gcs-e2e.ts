/**
 * REAL GCS end-to-end proof of physical erasure (expert reserve #4).
 *
 * Runs the ACTUAL production path — `GcsObjectStorage` (the same adapter the API
 * uses) driving `eraseSubjectStorage` — against a THROWAWAY bucket in a DEDICATED
 * TEST project (never prod), with the WIF-proof guardrails: Application Default
 * Credentials (no persistent key), ~$0, and a full teardown at the end. It seeds
 * real objects, lists BEFORE, erases, and re-checks the LIVE bucket AFTER
 * (0 objects, bucket gone), then writes a hashed before/after artifact.
 *
 *   GCP_TEST_PROJECT=ecode-wif-proof-834022 npx tsx services/api/scripts/physical-purge-gcs-e2e.ts --write
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '@google-cloud/storage';
import { eraseSubjectStorage } from '../src/account-storage-purge.js';
import { GcsObjectStorage, type StorageLike } from '../src/object-storage.js';

const TEST_PROJECT = process.env.GCP_TEST_PROJECT ?? 'ecode-wif-proof-834022';
const LOCATION = process.env.GCP_TEST_LOCATION ?? 'EU';

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

async function main() {
  const write = process.argv.includes('--write');
  const storage = new Storage({ projectId: TEST_PROJECT });
  const gcs = new GcsObjectStorage(storage as unknown as StorageLike);

  // Unique, clearly-namespaced throwaway project id → bucket `vc-purgee2e...`.
  const projectId = `purgee2e${Date.now().toString(36)}`;
  const seedKeys = ['assets/logo.png', 'data/export.json', 'nested/dir/notes.txt'];

  const bucketName = `vc-${projectId}`;
  let leaked = false;

  try {
    // ---- seed a REAL bucket + objects ----
    await gcs.ensureBucket(projectId);

    for (const key of seedKeys) {
      await gcs.putObject(projectId, { key, body: new Uint8Array([1, 2, 3, 4]), contentType: 'application/octet-stream' });
    }

    const objectsBefore = (await gcs.listObjects(projectId)).objects.map((o) => o.key).sort();

    if (objectsBefore.length !== seedKeys.length) {
      throw new Error(`seed failed: expected ${seedKeys.length} objects, found ${objectsBefore.length}`);
    }

    // ---- run the REAL erasure (production module + adapter) ----
    const outcome = await eraseSubjectStorage(
      { bucketProjectIds: [projectId], workspaceIds: [] },
      { objectStorage: gcs },
    );

    // ---- verify against the LIVE backend (reserve #2/#4) ----
    const bucketStillExists = await gcs.bucketExists(projectId);
    const objectsAfter = bucketStillExists ? (await gcs.listObjects(projectId)).objects.length : 0;

    if (!outcome.verified || bucketStillExists || objectsAfter !== 0) {
      leaked = bucketStillExists;
      throw new Error(
        `PHYSICAL_GCS_E2E_FAILED: verified=${outcome.verified} bucketStillExists=${bucketStillExists} objectsAfter=${objectsAfter}`,
      );
    }

    // ---- NEGATIVE (reserve #2 + #6): an inert backend must REFUSE, not certify ----
    const negProjectId = `purgee2eneg${Date.now().toString(36)}`;
    const negBucket = `vc-${negProjectId}`;
    let negRefusedAndSurvived = false;

    try {
      await gcs.ensureBucket(negProjectId);
      await gcs.putObject(negProjectId, { key: 'still-here.bin', body: new Uint8Array([9]), contentType: 'application/octet-stream' });

      // An inert (feature-flag-off) backend: active=false. It would answer
      // bucketExists=false ("absent"), but that proves nothing.
      const inert = {
        active: false,
        bucketExists: (p: string) => gcs.bucketExists(p),
        listObjects: (p: string) => gcs.listObjects(p),
        deleteBucket: () => {
          throw new Error('inert backend must never delete');
        },
      };
      const negOutcome = await eraseSubjectStorage(
        { bucketProjectIds: [negProjectId], workspaceIds: [] },
        { objectStorage: inert },
      );
      // Must REFUSE (not verified) AND the real bucket must SURVIVE untouched.
      const negBucketStillThere = await gcs.bucketExists(negProjectId);
      negRefusedAndSurvived = negOutcome.verified === false && negBucketStillThere === true;

      if (!negRefusedAndSurvived) {
        throw new Error(`NEGATIVE FAILED: inert backend was allowed to certify (verified=${negOutcome.verified}, bucketThere=${negBucketStillThere})`);
      }
    } finally {
      // teardown the negative bucket (it intentionally survived the refused purge)
      try {
        await storage.bucket(negBucket).deleteFiles({ force: true });
        await storage.bucket(negBucket).delete();
      } catch {
        /* best-effort */
      }
    }

    const artifact = {
      kind: 'physical-purge-gcs-e2e',
      version: 2,
      project: TEST_PROJECT,
      location: LOCATION,
      bucket: bucketName,
      before: { objects: objectsBefore, count: objectsBefore.length },
      after: { bucketExists: bucketStillExists, objectsRemaining: objectsAfter },
      negative: { inertBackendRefusedAndBucketSurvived: negRefusedAndSurvived },
      classes: outcome.classes,
      verified: outcome.verified,
    };
    const canonical = canonicalize(artifact);
    const sha256 = createHash('sha256').update(canonical).digest('hex');

    process.stdout.write(
      `PHYSICAL GCS E2E: PASS\n` +
        `  project: ${TEST_PROJECT} (dedicated test — not prod)\n` +
        `  bucket:  ${bucketName}\n` +
        `  objects before: ${objectsBefore.length}, bucket+objects after: gone / 0\n` +
        `  verified: ${outcome.verified}\n` +
        `  NEGATIVE (reserve #2): inert backend refused + bucket survived: ${negRefusedAndSurvived}\n` +
        `  sha256: ${sha256}\n`,
    );

    if (write) {
      const dir = join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../docs/deploy-evidence/2026-07-23-physical-purge-e2e',
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gcs-proof.json'), `${canonical}\n`);
      writeFileSync(join(dir, 'gcs-SHA256SUMS'), `${sha256}  gcs-proof.json\n`);
      process.stdout.write(`  wrote artifacts to ${dir}\n`);
    }
  } finally {
    // ---- teardown: never leave a test bucket behind (guardrail) ----
    if (leaked) {
      try {
        await storage.bucket(bucketName).deleteFiles({ force: true });
        await storage.bucket(bucketName).delete();
        process.stdout.write(`  teardown: force-deleted leaked bucket ${bucketName}\n`);
      } catch (error) {
        process.stderr.write(`  teardown WARNING: could not delete ${bucketName}: ${String(error)}\n`);
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
