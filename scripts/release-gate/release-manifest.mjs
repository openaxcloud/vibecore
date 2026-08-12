#!/usr/bin/env node
/**
 * RELEASE MANIFEST — the record of what a production rollout actually shipped, and
 * the tool that proves the cluster is running exactly that.
 *
 * The manifest binds, per service, the four things that must agree for a release to
 * be traceable at all:
 *
 *   service -> source commit -> Cloud Build id -> image digest (+ signature, SBOM)
 *
 * Without it, "what is running in prod?" is answered by reading a mutable tag off a
 * Deployment and hoping the registry still points where it pointed at build time.
 *
 * Two subcommands:
 *
 *   build           assemble + validate the manifest (refuses to emit an
 *                   unverifiable one: no digest, no build id for a rebuilt
 *                   service, digest/sha mismatch, unsigned image)
 *   verify-imageids compare the manifest against what the kubelet reports it is
 *                   actually running (`.status.containerStatuses[].imageID`)
 *
 * Both cores are pure functions so every refusal is unit-testable.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * Assemble and validate a release manifest.
 *
 * @param {object} input
 * @param {string} input.targetSha        full 40-hex source commit
 * @param {string} input.repository       owner/name
 * @param {string} input.registry         GAR repo root, e.g. europe-west9-docker.pkg.dev/p/r
 * @param {string} [input.workflowRunUrl]
 * @param {string} [input.gateVerdictSha256] sha256 of the release-gate verdict JSON
 * @param {string} [input.generatedAt]
 * @param {Array<object>} input.services  per-service facts (see validation below)
 * @returns {object} the manifest
 * @throws {Error} when the manifest would not be a proof of anything
 */
export function buildManifest(input) {
  const problems = [];

  if (!SHA_RE.test(String(input.targetSha ?? ''))) {
    problems.push(`targetSha must be a full 40-hex commit sha (got '${input.targetSha}')`);
  }
  if (!input.registry) {
    problems.push('registry is required');
  }
  if (!Array.isArray(input.services) || input.services.length === 0) {
    problems.push('services must be a non-empty array');
  }

  const services = (input.services ?? []).map((s) => {
    const where = `service '${s.service}'`;

    if (!s.service) {
      problems.push('a service entry has no name');
    }
    if (!DIGEST_RE.test(String(s.digest ?? ''))) {
      // The entire point of the manifest is the digest. An entry without one is a
      // tag-based deploy wearing a manifest's clothes.
      problems.push(`${where}: digest must be sha256:<64 hex> (got '${s.digest}')`);
    }
    if (s.rebuilt && !s.cloudBuildId) {
      // A service built by this run must name the build that produced it, otherwise
      // the image cannot be traced back to a build log or its inputs.
      problems.push(`${where}: rebuilt in this run but has no cloudBuildId`);
    }
    if (s.rebuilt && s.sourceSha && s.sourceSha !== input.targetSha) {
      problems.push(`${where}: built from '${s.sourceSha}' but the release targets '${input.targetSha}'`);
    }
    if (!s.signature || s.signature.verified !== true) {
      // Cosign signatures are already mandatory at admission (Kyverno). Recording an
      // unverified image here would let the manifest claim more than we checked.
      problems.push(`${where}: image signature not verified`);
    }

    return {
      service: s.service,
      image: s.image ?? s.service,
      // Not every image this release ships is a Deployment that gets rolled:
      //   chartService — has a `services.<key>` entry, so its digest is set on the chart
      //   rolled       — this workflow waits for its rollout and verifies its imageIDs
      // `admin` and `screenshotter` are chart services this path never rolls; the
      // workspace-agent is not a chart service at all (it is an image reference the
      // api hands to workspace pods). All three are still built, scanned, signature-
      // verified and recorded — dropping them from the manifest to keep the rollout
      // check simple would have silently ended their vulnerability coverage.
      chartService: s.chartService !== false,
      rolled: s.rolled !== false,
      // For a service this run did NOT rebuild, sourceSha is the commit that DID
      // build the image now running — carried forward, never silently restamped
      // with the current commit.
      sourceSha: s.sourceSha ?? (s.rebuilt ? input.targetSha : null),
      tag: s.tag ?? null,
      digest: s.digest,
      rebuilt: Boolean(s.rebuilt),
      cloudBuildId: s.cloudBuildId ?? null,
      signature: {
        verified: Boolean(s.signature?.verified),
        key: s.signature?.key ?? null,
      },
      sbom: s.sbom
        ? { format: s.sbom.format ?? null, sha256: s.sbom.sha256 ?? null, artifact: s.sbom.artifact ?? null }
        : null,
    };
  });

  if (problems.length > 0) {
    throw new Error(`refusing to emit an unverifiable release manifest:\n  - ${problems.join('\n  - ')}`);
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    repository: input.repository ?? null,
    targetSha: input.targetSha,
    shortSha: input.targetSha.slice(0, 10),
    registry: input.registry,
    workflowRunUrl: input.workflowRunUrl ?? null,
    gateVerdictSha256: input.gateVerdictSha256 ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    services,
  };
}

/**
 * Prove the cluster is running the manifest's digests.
 *
 * @param {object} manifest
 * @param {Record<string, string[]>} observed  service -> imageIDs reported by the kubelet
 * @returns {{ok: boolean, mismatches: string[], checked: number}}
 */
export function verifyImageIds(manifest, observed) {
  const mismatches = [];
  let checked = 0;

  // Only services this release actually rolled can be checked against running pods.
  // The filter lives here rather than in the caller so a workflow cannot quietly
  // narrow it: dropping a rolled service from the check is then a manifest change,
  // visible in the artifact, not an invisible edit to a jq expression.
  for (const svc of manifest.services.filter((s) => s.rolled !== false)) {
    const ids = observed[svc.service];

    if (!ids || ids.length === 0) {
      // No running pod reported an image for this service. Treated as a failure, not
      // a skip: "we could not look" must never read the same as "it matches".
      mismatches.push(`${svc.service}: no running pod reported an imageID`);
      continue;
    }

    for (const id of ids) {
      checked += 1;
      // imageID is like `<registry>/<repo>/api@sha256:...` (sometimes with a
      // `docker-pullable://` prefix). Comparing on the digest suffix is what matters:
      // it is the content identity, independent of how the node spells the registry.
      if (!id.endsWith(svc.digest)) {
        mismatches.push(`${svc.service}: pod runs '${id}', manifest says '${svc.digest}'`);
      }
    }
  }

  return { ok: mismatches.length === 0, mismatches, checked };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[(i += 1)];
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
}

function renderManifestSummary(manifest) {
  const rows = manifest.services.map((s) => {
    const build = s.rebuilt ? s.cloudBuildId : '(not rebuilt)';
    const sbom = s.sbom?.sha256 ? `${s.sbom.format} ${s.sbom.sha256.slice(0, 12)}…` : 'none';
    return `| ${s.service} | \`${(s.sourceSha ?? '?').slice(0, 10)}\` | ${build} | \`${s.digest.slice(0, 26)}…\` | ${
      s.signature.verified ? '✅' : '❌'
    } | ${sbom} |`;
  });
  return [
    `### Release manifest — \`${manifest.targetSha}\``,
    '',
    '| service | source SHA | Cloud Build id | image digest | signature | SBOM |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (cmd === 'build') {
    const input = readJson(args.input);
    const manifest = buildManifest(input);
    writeJson(args.out, manifest);
    const summary = renderManifestSummary(manifest);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n\n`);
    }
    return 0;
  }

  if (cmd === 'verify-imageids') {
    const manifest = readJson(args.manifest);
    const observed = readJson(args.observed);
    const result = verifyImageIds(manifest, observed);
    console.log(`imageID verification: ${result.checked} container(s) checked`);
    for (const m of result.mismatches) {
      console.error(`::error::imageID mismatch — ${m}`);
    }
    if (!result.ok) {
      console.error('::error::The cluster is NOT running the digests this release built. Investigate before trusting the rollout.');
      return 2;
    }
    console.log('✅ every running container matches its manifest digest');
    return 0;
  }

  console.error('usage: release-manifest.mjs build --input <in.json> --out <manifest.json>');
  console.error('       release-manifest.mjs verify-imageids --manifest <manifest.json> --observed <observed.json>');
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('release-manifest.mjs')) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(2);
  }
}
