#!/usr/bin/env node
/**
 * P0-04 — DAILY Replit baseline collector.
 *
 * Versions and SHA-256-hashes the public Replit surfaces the parity program
 * depends on, into docs/parity/baseline/snapshots/<YYYY-MM-DD>/, and prints a
 * SORTED diff against the previous snapshot.
 *
 * HARD RULES (from the external audit, P0-04):
 * - The cadence is DAILY. The Replit changelog is NOT weekly-Friday — the
 *   official index (llms.txt) contains `November 16, 2025` (a Sunday) and
 *   `November 26, 2025` (a Wednesday). Any automation keyed on "Friday" is
 *   defective by construction and forbidden.
 * - Link counts are a PROPERTY OF THE SNAPSHOT (recorded in the manifest),
 *   never a hard-coded constant.
 * - Nothing is invented: a fetch failure is recorded as status FAILED in the
 *   manifest, never papered over.
 *
 * Usage: node scripts/parity/collect-baseline.mjs [--date YYYY-MM-DD]
 * Exit codes: 0 = snapshot written (diff may be non-empty), 1 = every fetch
 * failed (no snapshot written).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const snapshotsRoot = join(repoRoot, 'docs', 'parity', 'baseline', 'snapshots');

/** The six tracked public surfaces. Keys are stable ids used in diffs. */
const SOURCES = [
  { id: 'llms-txt', url: 'https://docs.replit.com/llms.txt', kind: 'text', file: 'llms.txt' },
  { id: 'llms-full-txt', url: 'https://docs.replit.com/llms-full.txt', kind: 'text', file: 'llms-full.txt' },
  { id: 'sitemap-xml', url: 'https://docs.replit.com/sitemap.xml', kind: 'xml', file: 'sitemap.xml' },
  { id: 'changelog-index', url: 'https://docs.replit.com/updates', kind: 'html', file: 'changelog-index.html' },
  { id: 'product-blog', url: 'https://blog.replit.com/', kind: 'html', file: 'product-blog.html' },
  { id: 'pricing', url: 'https://replit.com/pricing', kind: 'html', file: 'pricing.html' },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Markdown link lines in llms.txt / URLs in a sitemap — the diffable units. */
function extractLinks(sourceId, text) {
  if (sourceId === 'llms-txt' || sourceId === 'llms-full-txt') {
    return text.split('\n').filter((line) => /^- \[/.test(line));
  }

  if (sourceId === 'sitemap-xml') {
    return [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  }

  // HTML surfaces: absolute links only, deduped — enough to see additions/removals.
  return [...new Set([...text.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((match) => match[1]))];
}

async function fetchSource(source) {
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'ecode-parity-baseline-collector/1 (+docs/parity)' },
      signal: AbortSignal.timeout(60_000),
    });

    const body = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      return { source, status: 'FAILED', httpStatus: response.status, body: null };
    }

    return { source, status: 'OK', httpStatus: response.status, body };
  } catch (error) {
    return { source, status: 'FAILED', httpStatus: 0, error: String(error?.message ?? error), body: null };
  }
}

function latestPreviousSnapshotDir(todayDir) {
  if (!existsSync(snapshotsRoot)) {
    return undefined;
  }

  const dirs = readdirSync(snapshotsRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name) && name !== todayDir)
    .sort();

  return dirs.length > 0 ? join(snapshotsRoot, dirs[dirs.length - 1]) : undefined;
}

const dateArgIndex = process.argv.indexOf('--date');
const today =
  dateArgIndex > -1 && process.argv[dateArgIndex + 1]
    ? process.argv[dateArgIndex + 1]
    : new Date().toISOString().slice(0, 10);

const outDir = join(snapshotsRoot, today);
mkdirSync(outDir, { recursive: true });

const results = await Promise.all(SOURCES.map((source) => fetchSource(source)));

const manifest = {
  schemaVersion: 1,
  collectedAt: new Date().toISOString(),
  cadence: 'daily',
  cadenceNote:
    'Replit changelog publishes on ARBITRARY weekdays (llms.txt index includes Sunday 2025-11-16 and Wednesday 2025-11-26). Friday-keyed automation is forbidden.',
  sources: {},
};

let okCount = 0;

for (const result of results) {
  const { source } = result;

  if (result.status !== 'OK') {
    manifest.sources[source.id] = {
      url: source.url,
      status: 'FAILED',
      httpStatus: result.httpStatus,
      error: result.error ?? null,
    };
    console.error(`[collect-baseline] FAILED ${source.id} (${source.url}) http=${result.httpStatus}`);
    continue;
  }

  okCount += 1;

  const text = result.body.toString('utf8');
  const links = extractLinks(source.id, text);
  writeFileSync(join(outDir, source.file), result.body);
  writeFileSync(join(outDir, `${source.id}.links.txt`), links.slice().sort().join('\n') + '\n');

  manifest.sources[source.id] = {
    url: source.url,
    status: 'OK',
    httpStatus: result.httpStatus,
    file: source.file,
    sha256: sha256(result.body),
    bytes: result.body.length,

    // A property of THIS snapshot — never a constant.
    linkCount: links.length,
  };

  console.log(
    `[collect-baseline] OK ${source.id} bytes=${result.body.length} links=${links.length} sha256=${manifest.sources[source.id].sha256.slice(0, 16)}…`,
  );
}

if (okCount === 0) {
  console.error('[collect-baseline] every fetch failed — no snapshot written');
  process.exit(1);
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/* ---- sorted diff vs the previous snapshot ------------------------------- */
const previousDir = latestPreviousSnapshotDir(today);

if (!previousDir) {
  console.log('[collect-baseline] first snapshot — no previous snapshot to diff against');
} else {
  const previousManifest = JSON.parse(readFileSync(join(previousDir, 'manifest.json'), 'utf8'));
  console.log(`[collect-baseline] diff vs ${previousDir.split('/').pop()}:`);

  for (const source of SOURCES) {
    const current = manifest.sources[source.id];
    const previous = previousManifest.sources?.[source.id];

    if (!current || current.status !== 'OK' || !previous || previous.status !== 'OK') {
      console.log(`  ${source.id}: (skipped — missing/failed in one side)`);
      continue;
    }

    if (current.sha256 === previous.sha256) {
      console.log(`  ${source.id}: unchanged (${current.sha256.slice(0, 12)}…)`);
      continue;
    }

    const previousLinksPath = join(previousDir, `${source.id}.links.txt`);
    const currentLinks = readFileSync(join(outDir, `${source.id}.links.txt`), 'utf8').split('\n').filter(Boolean);
    const previousLinks = existsSync(previousLinksPath)
      ? readFileSync(previousLinksPath, 'utf8').split('\n').filter(Boolean)
      : [];

    const previousSet = new Set(previousLinks);
    const currentSet = new Set(currentLinks);
    const added = currentLinks.filter((link) => !previousSet.has(link)).sort();
    const removed = previousLinks.filter((link) => !currentSet.has(link)).sort();

    console.log(
      `  ${source.id}: CHANGED bytes ${previous.bytes}→${current.bytes}, links ${previous.linkCount}→${current.linkCount}, +${added.length}/-${removed.length}`,
    );

    for (const line of added) {
      console.log(`    + ${line}`);
    }

    for (const line of removed) {
      console.log(`    - ${line}`);
    }
  }
}

console.log(`[collect-baseline] snapshot written to ${outDir}`);
