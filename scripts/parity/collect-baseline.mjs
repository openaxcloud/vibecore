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
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyRenderedCapture, createWarcResponseRecord } from './collector-integrity.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const snapshotsRoot = join(repoRoot, 'docs', 'parity', 'baseline', 'snapshots');

/*
 * Tracked public surfaces, in THREE families (audit v4 P0-#1 — the collector was
 * blind to Community Profiles because it watched docs only):
 *  - docs: plain fetch (text/xml/html).
 *  - product-route: JS-RENDERED via a headless browser + hashed. A raw fetch of
 *    replit.com/community returns only a shell (or a Cloudflare block) — you'd
 *    read "nothing" and conclude "nothing". These pages are archived RENDERED.
 *  - launch-channel: the official launch surfaces (blog, changelog, release notes).
 *
 * `watchTerms` are notable strings whose appearance in a snapshot is surfaced in
 * the manifest — this is what proves Community Profiles is now detected.
 */
const SOURCES = [
  // --- docs (fetch) ---
  { id: 'llms-txt', url: 'https://docs.replit.com/llms.txt', kind: 'text', file: 'llms.txt', family: 'docs' },
  {
    id: 'llms-full-txt',
    url: 'https://docs.replit.com/llms-full.txt',
    kind: 'text',
    file: 'llms-full.txt',
    family: 'docs',
  },
  { id: 'sitemap-xml', url: 'https://docs.replit.com/sitemap.xml', kind: 'xml', file: 'sitemap.xml', family: 'docs' },
  // --- launch-channel (fetch/html) ---
  {
    id: 'changelog-index',
    url: 'https://docs.replit.com/updates',
    kind: 'html',
    file: 'changelog-index.html',
    family: 'launch-channel',
  },
  {
    id: 'product-blog',
    url: 'https://blog.replit.com/',
    kind: 'html',
    file: 'product-blog.html',
    family: 'launch-channel',
  },
  // --- product-route (JS-RENDERED) ---
  {
    id: 'pricing',
    url: 'https://replit.com/pricing',
    kind: 'html',
    file: 'pricing.rendered.html',
    family: 'product-route',
    render: true,
  },
  {
    id: 'gallery',
    url: 'https://replit.com/gallery',
    kind: 'html',
    file: 'gallery.rendered.html',
    family: 'product-route',
    render: true,
  },
  {
    id: 'community',
    url: 'https://replit.com/community',
    kind: 'html',
    file: 'community.rendered.html',
    family: 'product-route',
    render: true,
  },
  // --- governance / operational channels (audit v4 A) ---
  { id: 'status', url: 'https://status.replit.com/', kind: 'html', file: 'status.html', family: 'status' },
  {
    id: 'trust-safety',
    url: 'https://docs.replit.com/legal-and-security-info/misuse-and-trust-safety-policies',
    kind: 'html',
    file: 'trust-safety.html',
    family: 'trust-safety',
  },
  {
    id: 'security',
    url: 'https://docs.replit.com/legal-and-security-info/security',
    kind: 'html',
    file: 'security.html',
    family: 'security',
  },
  { id: 'legal-terms', url: 'https://replit.com/site/terms', kind: 'html', file: 'legal-terms.html', family: 'legal' },
];

/** Notable strings whose presence in any snapshot is recorded in the manifest. */
const WATCH_TERMS = ['Community Profiles', 'Community Profile', 'Claim your profile', 'Buildathons', 'Submit your App'];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/*
 * Assainissement AVANT écriture et hash (2026-07-17) : les pages tierces
 * embarquent des jetons CLIENT publics (clé web Google AIza…, jeton Datadog
 * browser pub…) qui déclenchent le secret-scan bloquant de la CI alors que ce
 * ne sont pas des secrets. On les caviarde à la capture ; le sha256 du
 * manifest est celui du fichier assaini. Motifs volontairement étroits —
 * aucun motif de VRAI secret n'est caviardé : un vrai secret doit faire
 * échouer le scan, pas être masqué en silence.
 */
function sanitizeSnapshot(buffer) {
  const text = buffer.toString('utf8');
  const sanitized = text
    .replace(/AIza[0-9A-Za-z_-]{35}/g, 'AIza_REDACTED_PUBLIC_WEB_KEY_x0000000')
    .replace(/dd-api-key=pub[a-f0-9]{32}/g, 'dd-api-key=REDACTED');

  return sanitized === text ? buffer : Buffer.from(sanitized, 'utf8');
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
      return {
        source,
        status: response.status === 404 || response.status === 410 ? 'ROUTE_REMOVED' : 'FAILED',
        httpStatus: response.status,
        finalUrl: response.url,
        body: null,
      };
    }

    return {
      source,
      status: 'OK',
      httpStatus: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') ?? undefined,
      body,
    };
  } catch (error) {
    return { source, status: 'FAILED', httpStatus: 0, error: String(error?.message ?? error), body: null };
  }
}

/*
 * CI passes the absolute module installed in collector-runtime. That explicit
 * path prevents a globally installed package (or an unrelated root install)
 * from making the job pass accidentally. The local package lookup remains as
 * a developer convenience when running from a fully installed checkout.
 */
function loadChromium() {
  const req = createRequire(import.meta.url);
  const configuredModule = process.env.PARITY_PLAYWRIGHT_MODULE;

  if (configuredModule) {
    const absoluteModule = resolve(configuredModule);
    try {
      const chromium = req(absoluteModule).chromium;
      if (!chromium) {
        return { chromium: null, error: `configured Playwright module has no chromium export: ${absoluteModule}` };
      }

      console.log(`[collect-baseline] using configured Playwright module ${absoluteModule}`);
      return { chromium, error: null };
    } catch (error) {
      return {
        chromium: null,
        error: `configured Playwright module failed to load (${absoluteModule}): ${String(error?.message ?? error)}`,
      };
    }
  }

  try {
    return { chromium: req('playwright').chromium, error: null };
  } catch (directError) {
    try {
      // pnpm keeps Playwright beside @playwright/test instead of hoisting the
      // transitive package. Resolve from that checked-in root dependency
      // without hard-coding pnpm's versioned store layout.
      const testEntry = req.resolve('@playwright/test');
      return { chromium: createRequire(testEntry)('playwright').chromium, error: null };
    } catch (testDependencyError) {
      return {
        chromium: null,
        error:
          `local Playwright module unavailable: ${String(directError?.message ?? directError)}; ` +
          `@playwright/test fallback unavailable: ${String(testDependencyError?.message ?? testDependencyError)}`,
      };
    }
  }
}

const REALISTIC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * JS-render the product-route sources with a headless browser. A plain fetch of
 * these pages returns only a shell (or a Cloudflare block); rendering is the
 * only faithful archive. Returns per-source results with the rendered HTML.
 */
async function renderSources(renderSources) {
  const { chromium, error: chromiumError } = loadChromium();

  if (!chromium) {
    return renderSources.map((source) => ({
      source,
      status: 'RENDER_UNAVAILABLE',
      httpStatus: 0,
      error: chromiumError,
      body: null,
    }));
  }

  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const results = [];

  try {
    const context = await browser.newContext({
      userAgent: REALISTIC_UA,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });

    for (const source of renderSources) {
      try {
        const page = await context.newPage();
        try {
          const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.waitForTimeout(6_000); // let client render settle

          for (let i = 1; i <= 4; i++) {
            await page.evaluate((f) => window.scrollTo(0, (document.body.scrollHeight * f) / 4), i);
            await page.waitForTimeout(600);
          }

          const html = await page.evaluate(() => document.documentElement.outerHTML);
          const text = await page.evaluate(() => document.body.innerText);
          const finalUrl = page.url();
          const classification = classifyRenderedCapture({
            sourceId: source.id,
            requestedUrl: source.url,
            finalUrl,
            httpStatus: response?.status() ?? 0,
            html,
            text,
          });

          if (classification.status !== 'OK') {
            results.push({
              source,
              ...classification,
              finalUrl,
              body: null,
            });
            continue;
          }

          results.push({
            source,
            status: 'OK',
            httpStatus: classification.httpStatus,
            finalUrl,
            contentType: response?.headers()['content-type'] ?? 'text/html; charset=utf-8',
            body: Buffer.from(html, 'utf8'),
            renderedText: text,
          });
        } finally {
          await page.close();
        }
      } catch (error) {
        results.push({ source, status: 'FAILED', httpStatus: 0, error: String(error?.message ?? error), body: null });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
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

const fetchSources = SOURCES.filter((source) => !source.render);
const jsRenderSources = SOURCES.filter((source) => source.render);
const collectionStartedAt = new Date().toISOString();

const [fetched, rendered] = await Promise.all([
  Promise.all(fetchSources.map((source) => fetchSource(source))),
  renderSources(jsRenderSources),
]);
const results = [...fetched, ...rendered];

const manifest = {
  schemaVersion: 2,
  collectedAt: collectionStartedAt,
  cadence: 'daily',
  cadenceNote:
    'Replit changelog publishes on ARBITRARY weekdays (llms.txt index includes Sunday 2025-11-16 and Wednesday 2025-11-26). Friday-keyed automation is forbidden.',
  families: ['docs', 'launch-channel', 'product-route'],
  watchTerms: WATCH_TERMS,
  watchHits: {}, // term -> [sourceId, ...]
  sources: {},
};

let okCount = 0;

for (const result of results) {
  const { source } = result;

  if (result.status !== 'OK') {
    manifest.sources[source.id] = {
      url: source.url,
      family: source.family,
      status: result.status, // FAILED | BLOCKED | RENDER_UNAVAILABLE
      httpStatus: result.httpStatus,
      error: result.error ?? null,
    };
    console.error(`[collect-baseline] ${result.status} ${source.id} (${source.url}) http=${result.httpStatus}`);
    continue;
  }

  okCount += 1;

  result.body = sanitizeSnapshot(result.body);

  const text = result.body.toString('utf8');
  const links = extractLinks(source.id, text);
  writeFileSync(join(outDir, source.file), result.body);
  writeFileSync(join(outDir, `${source.id}.links.txt`), links.slice().sort().join('\n') + '\n');

  const archiveFile = `${source.id}.warc`;
  const archive = createWarcResponseRecord({
    url: result.finalUrl ?? source.url,
    capturedAt: manifest.collectedAt,
    httpStatus: result.httpStatus,
    contentType:
      result.contentType ?? (source.kind === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'),
    body: result.body,
  });
  writeFileSync(join(outDir, archiveFile), archive);

  let renderedTextFile;
  let renderedTextBytes;
  let renderedTextSha256;
  if (source.render) {
    renderedTextFile = `${source.id}.rendered.txt`;
    const renderedTextBody = sanitizeSnapshot(Buffer.from(result.renderedText ?? '', 'utf8'));
    renderedTextBytes = renderedTextBody.length;
    renderedTextSha256 = sha256(renderedTextBody);
    writeFileSync(join(outDir, renderedTextFile), renderedTextBody);
  }

  // Watch-term detection: search the rendered TEXT (falls back to raw for docs).
  // This is how Community Profiles is surfaced — a property of the snapshot.
  const haystack = result.renderedText ?? text;
  const termsHere = WATCH_TERMS.filter((term) => haystack.toLowerCase().includes(term.toLowerCase()));
  for (const term of termsHere) {
    (manifest.watchHits[term] ??= []).push(source.id);
  }

  manifest.sources[source.id] = {
    url: source.url,
    family: source.family,
    sourceType: source.family, // observation field
    status: 'OK',
    rendered: Boolean(source.render),
    httpStatus: result.httpStatus,
    file: source.file,
    sha256: sha256(result.body),
    bytes: result.body.length,
    finalUrl: result.finalUrl ?? source.url,
    archiveFormat: 'WARC/1.1',
    archiveFile,
    archiveSha256: sha256(archive),
    ...(source.render
      ? {
          renderedTextFile,
          renderedTextBytes,
          renderedTextSha256,
        }
      : {}),

    // eventDate is UNKNOWN for a page snapshot (no publish date on a route);
    // detectionDate is when WE saw it — the pair makes blindness measurable.
    eventDate: 'UNKNOWN',
    detectionDate: manifest.collectedAt,

    // A property of THIS snapshot — never a constant.
    linkCount: links.length,
    watchTerms: termsHere,
  };

  console.log(
    `[collect-baseline] OK ${source.id} [${source.family}${source.render ? '/rendered' : ''}] bytes=${result.body.length} links=${links.length}${termsHere.length ? ` watch=${termsHere.join('|')}` : ''} sha256=${manifest.sources[source.id].sha256.slice(0, 16)}…`,
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
    const currentLinks = readFileSync(join(outDir, `${source.id}.links.txt`), 'utf8')
      .split('\n')
      .filter(Boolean);
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
