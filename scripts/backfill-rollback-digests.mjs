#!/usr/bin/env node
/*
 * D2 (approved 2026-07-17) — retainedDigest BACKFILL for pre-digest server deploys.
 *
 * Server rollback is digest-only and fail-closed (I-REL-1): a READY server
 * deployment whose metadata retained no sha256 image digest cannot be rolled
 * back to (409 ROLLBACK_NO_RETAINED_DIGEST). Deployments built BEFORE digest
 * retention shipped still have a live Artifact Registry image at
 * `<repo>/p-<projectId>:<deploymentId>` — this script writes that image's
 * digest back into `metadata.serverDeploy.image.imageDigest` so they become
 * legitimate rollback targets again. Deployments whose artifact is gone are
 * left untouched and keep their honest 409.
 *
 * The script runs ON an api pod (it needs the pod's DATABASE_URL + pg); the
 * digest resolution needs gcloud, which the pod does not have — so it is a
 * two-step, operator-in-the-loop flow:
 *
 *   1. kubectl -n vibecore exec -i <api-pod> -- node - list < this-file
 *      → prints JSON candidates: [{id, uri}] (READY server deploys, no digest,
 *        with a recorded imageUri).
 *   2. For each: gcloud artifacts docker images describe "<uri>" \
 *        --format='value(image_summary.digest)'   (skip if the artifact is gone)
 *   3. kubectl exec -i ... -- node - apply '<json>' < this-file
 *      with '<json>' = [{"id":"...","digest":"sha256:..."}]
 *
 * `apply` is idempotent and NEVER overwrites an existing digest.
 * Executed in prod 2026-07-17: 9/9 backfilled, see
 * docs/deploy-evidence/2026-07-17-rollback-permanent/.
 */

import { createRequire } from 'node:module';

const require = createRequire('/runtime/');
const { Client } = require('pg');

const SHA256 = /^sha256:[a-f0-9]{64}$/;

const [, , mode, payload] = process.argv;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  if (mode === 'list') {
    const { rows } = await client.query(`
      SELECT id,
        (metadata->'serverDeploy'->'image'->>'imageUri') AS uri,
        (metadata->'serverDeploy'->'image'->>'imageDigest') AS digest
      FROM "Deployment"
      WHERE provider = 'server' AND status = 'READY'
      ORDER BY "createdAt" DESC
    `);
    const candidates = rows.filter((r) => r.uri && (!r.digest || !SHA256.test(r.digest)));
    console.log(JSON.stringify(candidates.map((r) => ({ id: r.id, uri: r.uri })), null, 2));
  } else if (mode === 'apply') {
    const entries = JSON.parse(payload ?? '[]');

    for (const { id, digest } of entries) {
      if (!SHA256.test(digest ?? '')) {
        console.error(`SKIP ${id}: malformed digest "${digest}"`);
        continue;
      }

      /*
       * Guarded UPDATE: only rows still MISSING a digest, and the imageRef is
       * (re)derived from the recorded imageUri with the tag stripped — the
       * exact shape resolveRollbackImage() validates.
       */
      const { rowCount } = await client.query(
        `UPDATE "Deployment"
         SET metadata = jsonb_set(
           jsonb_set(
             metadata,
             '{serverDeploy,image,imageDigest}', to_jsonb($2::text), true
           ),
           '{serverDeploy,image,imageRef}',
           to_jsonb(regexp_replace(metadata->'serverDeploy'->'image'->>'imageUri', ':[^:/]+$', '')), true
         )
         WHERE id = $1 AND provider = 'server' AND status = 'READY'
           AND (metadata->'serverDeploy'->'image'->>'imageUri') IS NOT NULL
           AND (metadata->'serverDeploy'->'image'->>'imageDigest') IS NULL`,
        [id, digest],
      );
      console.log(`${rowCount === 1 ? 'BACKFILLED' : 'UNCHANGED (already has digest / not eligible)'} ${id}`);
    }
  } else {
    console.error('usage: node backfill-rollback-digests.mjs <list|apply> [json]');
    process.exitCode = 2;
  }
} finally {
  await client.end();
}
