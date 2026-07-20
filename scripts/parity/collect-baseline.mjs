#!/usr/bin/env node
/**
 * P0-04 — Replit baseline collector (DAILY + event-driven).
 *
 * Versions and SHA-256-hashes the public Replit surfaces the parity program
 * depends on, into docs/parity/baseline/snapshots/<YYYY-MM-DD>/, prints a
 * SORTED diff against the previous snapshot, and maintains an APPEND-ONLY
 * observation ledger (docs/parity/baseline/observations/ledger.jsonl) whose
 * eventDate→detectionDate gap makes our blindness MEASURABLE.
 *
 * FIVE source families (manifest field `family`):
 *   documentation     llms.txt, llms-full.txt, sitemap, changelog index,
 *                     blog (raw), pricing (rendered)
 *   product-route     replit.com/, /gallery, /community, community-hub
 *                     — JS-RENDERED via headless chromium. Measured
 *                     2026-07-17: a raw fetch of replit.com/community returns
 *                     a 2,891-byte shell (title only, zero content markers).
 *                     You'd read "nothing" and conclude "nothing". JS pages
 *                     are archived RENDERED (html + extracted text +
 *                     screenshot, all hashed), never as raw shells.
 *   legal-status      terms, trust-and-safety.md, security, status page
 *                     (rendered — plain fetch of status.replit.com measured
 *                     HTTP 403 on 2026-07-17 with any UA)
 *   launch-channel    changelog entries, blog (rendered) + native-client
 *                     store listings (iOS App Store, Google Play)
 *   authenticated-ui  NOT automated — per-plan/per-region/per-client UI
 *                     observation needs accounts; manual intake only
 *                     (docs/parity/baseline/observations/manual/*.jsonl).
 *                     Coverage is recorded as UNKNOWN, never faked.
 *
 * HARD RULES (external audit P0-04 + audit v4 A/B):
 * - Cadence is DAILY (the changelog publishes on arbitrary weekdays — llms.txt
 *   lists Sunday 2025-11-16 and Wednesday 2025-11-26; Friday-keyed automation
 *   is forbidden) PLUS event-driven runs (workflow_dispatch /
 *   repository_dispatch).
 * - Counts (links, gallery results, categories) are PROPERTIES OF THE
 *   SNAPSHOT, never hard-coded constants.
 * - Nothing is invented: fetch failures are FAILED, robots exclusions are
 *   SKIPPED_ROBOTS, bot walls are BLOCKED, a missing browser is
 *   RENDER_UNAVAILABLE, unknown data is UNKNOWN.
 * - robots.txt honored per RFC 9309 for raw AND rendered fetches (5xx on
 *   robots.txt → treat host as fully disallowed; 4xx → no restrictions).
 * - Bounded work is LOGGED when the bound trims anything (no silent caps).
 *
 * Usage: node scripts/parity/collect-baseline.mjs [--date YYYY-MM-DD]
 *          [--raw-only] [--require-render]
 *   --raw-only        debug: skip chromium; rendered sources become
 *                     RENDER_UNAVAILABLE (recorded, not hidden)
 *   --require-render  exit 2 unless EVERY rendered source is OK — the CI
 *                     smoke gate that proves rendering works from GitHub
 *                     runners (UNK-COLLECTOR-CI-RENDER)
 * Exit codes: 0 = snapshot written; 1 = every fetch failed (no snapshot);
 *             2 = --require-render and at least one rendered source not OK.
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const snapshotsRoot = join(repoRoot, 'docs', 'parity', 'baseline', 'snapshots');
const observationsRoot = join(repoRoot, 'docs', 'parity', 'baseline', 'observations');
const ledgerPath = join(observationsRoot, 'ledger.jsonl');
const manualDir = join(observationsRoot, 'manual');

const RAW_UA = 'ecode-parity-baseline-collector/2 (+https://github.com/openaxcloud/vibecore/tree/main/docs/parity)';
const ROBOTS_UA_TOKEN = 'ecode-parity-baseline-collector';
// Rendered pages use a realistic UA (established on main by audit v4 P0-#1):
// robots.txt is checked FIRST either way, so this is presentation, not evasion
// of a crawl exclusion.
const REALISTIC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Triage SLA per criticality — hours until a PENDING observation is overdue. */
const TRIAGE_SLA_HOURS = { P0: 24, P1: 72, P2: 168 };

/**
 * Watch terms, scanned case-insensitively over EVERY captured text of EVERY
 * snapshot day on disk (so first-detection dates are measured from the
 * archive). A term with zero hits anywhere is reported as NEVER SEEN —
 * recorded absence, not silence. Terms are configuration; hits are
 * measurements.
 */
const WATCH_TERMS = [
  'Community Profiles',
  'Claim your profile',
  'Power Ranking',
  'Ramp for Agents',
  'Excalidraw',
  'Buy a domain',
  'Buildathons',
  'Submit your App',
  // Dynamic profile-hub content: present in some renders, absent in others
  // (measured 2026-07-17: probe render had it, collector run 3 did not) — a
  // watch term, NOT a non-regression expectation.
  'streak',
];

/**
 * Tracked public surfaces. `priority` orders collection (1 = collected first
 * — documentation and legal before slower product routes). v1/v2 ids and file
 * names are preserved so link-diff continuity survives.
 * `expect` strings are NON-REGRESSION checks (case-insensitive contains on
 * the captured text); failures land in the manifest AND the ledger.
 */
const SOURCES = [
  // --- documentation (raw fetch — server-rendered surfaces) ---
  { id: 'llms-txt', url: 'https://docs.replit.com/llms.txt', kind: 'text', file: 'llms.txt', family: 'documentation', priority: 1 },
  { id: 'llms-full-txt', url: 'https://docs.replit.com/llms-full.txt', kind: 'text', file: 'llms-full.txt', family: 'documentation', priority: 1 },
  { id: 'sitemap-xml', url: 'https://docs.replit.com/sitemap.xml', kind: 'xml', file: 'sitemap.xml', family: 'documentation', priority: 1 },

  // --- launch-channel ---
  { id: 'changelog-index', url: 'https://docs.replit.com/updates', kind: 'html', file: 'changelog-index.html', family: 'launch-channel', priority: 1 },
  { id: 'product-blog', url: 'https://blog.replit.com/', kind: 'html', file: 'product-blog.html', family: 'launch-channel', priority: 1 },
  {
    id: 'blog-rendered', url: 'https://blog.replit.com/', kind: 'html', file: 'blog-rendered.html',
    family: 'launch-channel', priority: 3, render: true,
    // The raw blog index is a JS shell too (22 links, one post title,
    // measured 2026-07-16/17); launch announcements need the rendered index.
    expect: ['Blog'],
  },
  // Native-client release notes ("What's New" sections of the store listings).
  { id: 'appstore-ios', url: 'https://apps.apple.com/us/app/replit-vibe-code-with-ai-fast/id1614022293', kind: 'html', file: 'appstore-ios.html', family: 'launch-channel', priority: 3, client: 'ios' },
  { id: 'playstore-android', url: 'https://play.google.com/store/apps/details?id=com.replit.app', kind: 'html', file: 'playstore-android.html', family: 'launch-channel', priority: 3, client: 'android' },

  // --- product-route (JS-RENDERED) ---
  {
    id: 'pricing', url: 'https://replit.com/pricing', kind: 'html', file: 'pricing.rendered.html',
    family: 'product-route', priority: 2, render: true,
    expect: ['Replit Core', 'Free'],
  },
  {
    id: 'gallery', url: 'https://replit.com/gallery', kind: 'html', file: 'gallery.rendered.html',
    family: 'product-route', priority: 2, render: true,
    // Non-regression against the 2026-07-16 live measurement (RPL-17):
    // results counter, Load all apps, view/use counters, and the EXTERNAL
    // Typeform intake (curated submission, NOT self-service publish).
    expect: ['Results', 'Load all apps', 'Submit your App', 'form.typeform.com/to/yVYAWg79', 'Views', 'Used'],
  },
  {
    id: 'community', url: 'https://replit.com/community', kind: 'html', file: 'community.rendered.html',
    family: 'product-route', priority: 2, render: true,
    expect: ['Claim your profile', 'Community'],
  },
  {
    id: 'community-hub', url: 'https://community-hub.replit.app/', kind: 'html', file: 'community-hub.rendered.html',
    family: 'product-route', priority: 2, render: true,
    // The profiles hub carries Power Ranking (measured rendered 2026-07-17;
    // replit.com/community itself does not surface it). 'streak' is dynamic
    // (present in some renders only) — tracked as a watch term instead.
    expect: ['Power Ranking', 'Claim your profile'],
  },
  {
    id: 'home', url: 'https://replit.com/', kind: 'html', file: 'home.rendered.html',
    family: 'product-route', priority: 2, render: true,
    expect: ['Replit'],
  },

  // --- legal-status ---
  {
    id: 'status', url: 'https://status.replit.com/', kind: 'html', file: 'status.rendered.html',
    family: 'legal-status', priority: 2, render: true,
    // Raw fetch measured HTTP 403 on 2026-07-17 (any UA) — rendered only.
    // MEASURED 2026-07-19 (PR #14 render-smoke, job 88269954621): Statuspage
    // 403s GitHub-hosted runners even rendered, while a local render passes.
    // Exempt from the --require-render CI gate so the gate stays meaningful
    // for the sources that CAN render from CI; every blocked run is still
    // recorded (status=BLOCKED + SOURCE_BLOCKED observation). Coverage fix
    // would be a dedicated renderer egress (self-hosted runner / proxy).
    renderGateExempt: true,
    expect: ['Operational'],
  },
  // 'misuse-and-trust-safety-policies' 404'd in every snapshot through
  // 2026-07-17; the live slug (from llms.txt) is 'trust-and-safety'.
  { id: 'trust-safety', url: 'https://docs.replit.com/legal-and-security-info/trust-and-safety.md', kind: 'text', file: 'trust-safety.md', family: 'legal-status', priority: 1 },
  { id: 'security', url: 'https://docs.replit.com/legal-and-security-info/security', kind: 'html', file: 'security.html', family: 'legal-status', priority: 1 },
  { id: 'legal-terms', url: 'https://replit.com/site/terms', kind: 'html', file: 'legal-terms.html', family: 'legal-status', priority: 1 },
];

const FAMILIES = ['documentation', 'product-route', 'legal-status', 'launch-channel', 'authenticated-ui'];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function log(line) {
  console.log(`[collect-baseline] ${line}`);
}

function logError(line) {
  console.error(`[collect-baseline] ${line}`);
}


/*
 * Assainissement AVANT écriture et hash (2026-07-19, porté de #10) : les
 * pages tierces embarquent des jetons CLIENT publics (clé web Google AIza…,
 * jeton Datadog browser pub…) qui déclenchent le secret-scan bloquant de la
 * CI alors que ce ne sont pas des secrets. On les caviarde à la capture ; le
 * sha256 du manifest est celui du fichier assaini. Motifs volontairement
 * étroits — aucun motif de VRAI secret n'est caviardé : un vrai secret doit
 * faire échouer le scan, pas être masqué en silence.
 */
function sanitizeText(text) {
  return text
    .replace(/AIza[0-9A-Za-z_-]{35}/g, 'AIza_REDACTED_PUBLIC_WEB_KEY_x0000000')
    .replace(/dd-api-key=pub[a-f0-9]{32}/g, 'dd-api-key=REDACTED');
}

function sanitizeSnapshot(buffer) {
  const text = buffer.toString('utf8');
  const sanitized = sanitizeText(text);

  return sanitized === text ? buffer : Buffer.from(sanitized, 'utf8');
}

/* ---- robots.txt (RFC 9309) ---------------------------------------------- */

const robotsCache = new Map();

function parseRobots(text) {
  const groups = [];
  let current = null;
  let sawRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === 'user-agent') {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ type: key, path: value });
      sawRule = true;
    }
  }

  return groups;
}

function robotsPathMatches(pattern, path) {
  if (pattern === '') return false; // empty Disallow = allow everything

  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp('^' + (escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped));

  return regex.test(path);
}

async function robotsDecision(url) {
  const { origin, pathname, search } = new URL(url);

  if (!robotsCache.has(origin)) {
    let entry;

    // A TRANSIENT network error on one robots.txt fetch must not disqualify a
    // whole host for the day — retry before applying the RFC disallow-all.
    for (let attempt = 1; attempt <= 3 && !entry; attempt++) {
      try {
        const response = await fetch(`${origin}/robots.txt`, {
          redirect: 'follow',
          headers: { 'user-agent': RAW_UA },
          signal: AbortSignal.timeout(20_000),
        });
        const body = await response.text();

        if (response.ok && !/^\s*</.test(body)) {
          entry = { policy: 'parsed', groups: parseRobots(body) };
        } else if (response.status >= 500) {
          // RFC 9309 §2.3.1.4: unreachable robots.txt (server error) → the
          // whole host MUST be treated as disallowed. Retry first.
          if (attempt === 3) entry = { policy: 'robots-5xx-disallow-all' };
        } else {
          // 404/403/HTML-shell where robots.txt should be → no restrictions
          // (RFC 9309 §2.3.1.3: 4xx MAY be treated as no robots.txt).
          entry = { policy: response.ok ? 'no-robots-txt-html-shell' : `no-robots-txt-http-${response.status}` };
        }
      } catch (error) {
        if (attempt === 3) {
          entry = { policy: 'robots-unreachable-disallow-all', error: String(error?.message ?? error) };
          logError(`robots.txt unreachable for ${origin} after 3 attempts: ${entry.error}`);
        }
      }

      if (!entry) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 2_000));
    }

    robotsCache.set(origin, entry);
  }

  const entry = robotsCache.get(origin);

  if (entry.policy.endsWith('disallow-all')) return { allowed: false, policy: entry.policy };
  if (entry.policy !== 'parsed') return { allowed: true, policy: entry.policy };

  const path = pathname + (search || '');
  const ourGroups = entry.groups.filter((group) => group.agents.some((agent) => agent !== '*' && ROBOTS_UA_TOKEN.includes(agent)));
  const starGroups = entry.groups.filter((group) => group.agents.includes('*'));
  const rules = (ourGroups.length > 0 ? ourGroups : starGroups).flatMap((group) => group.rules);

  // Longest-match wins; ties go to allow.
  let best = { type: 'allow', length: -1 };

  for (const rule of rules) {
    if (!robotsPathMatches(rule.path, path)) continue;
    if (rule.path.length > best.length || (rule.path.length === best.length && rule.type === 'allow')) {
      best = { type: rule.type, length: rule.path.length };
    }
  }

  return { allowed: best.type !== 'disallow', policy: 'parsed' };
}

/* ---- bot-wall detection --------------------------------------------------- */

const BOT_WALL_MARKERS = [
  'just a moment',
  'attention required',
  'cf-chl',
  'checking your browser',
  'verify you are human',
  'been blocked',
  'security service to protect',
  'enable javascript and cookies to continue',
];

function detectBotWall(httpStatus, textSample) {
  const sample = (textSample ?? '').slice(0, 20_000).toLowerCase();
  const marker = BOT_WALL_MARKERS.find((m) => sample.includes(m));

  if (marker) return `content marker: "${marker}"`;
  if ([403, 429, 503].includes(httpStatus)) return `http ${httpStatus}`;

  return null;
}

/* ---- link extraction (diffable units) -------------------------------------- */

function extractLinks(source, text, baseUrl) {
  if (source.id === 'llms-txt' || source.id === 'llms-full-txt') {
    return text.split('\n').filter((line) => /^- \[/.test(line));
  }

  if (source.id === 'sitemap-xml') {
    return [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  }

  // HTML surfaces: absolute + root-relative hrefs, resolved and deduped.
  const out = new Set();

  for (const match of text.matchAll(/href="([^"#][^"]*)"/g)) {
    try {
      const resolved = new URL(match[1], baseUrl ?? source.url);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') out.add(resolved.href);
    } catch {
      // unparseable href — not a link unit
    }
  }

  return [...out];
}

/* ---- WARC (ISO 28500) archive ----------------------------------------------- */

const warcRecords = [];

function warcRecord(headers, bodyBuffer) {
  const head = Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n');

  return Buffer.concat([
    Buffer.from(`WARC/1.1\r\n${head}\r\nContent-Length: ${bodyBuffer.length}\r\n\r\n`, 'utf8'),
    bodyBuffer,
    Buffer.from('\r\n\r\n', 'utf8'),
  ]);
}

function warcAddResponse(url, httpStatus, headersObj, payload) {
  const headerLines = Object.entries(headersObj ?? {}).map(([key, value]) => `${key}: ${value}`).join('\r\n');
  const httpBlock = Buffer.concat([Buffer.from(`HTTP/1.1 ${httpStatus} \r\n${headerLines}\r\n\r\n`, 'utf8'), payload]);

  warcRecords.push(
    warcRecord(
      {
        'WARC-Type': 'response',
        'WARC-Record-ID': `<urn:uuid:${randomUUID()}>`,
        'WARC-Date': new Date().toISOString(),
        'WARC-Target-URI': url,
        'WARC-Payload-Digest': `sha-256:${sha256(payload)}`,
        'Content-Type': 'application/http;msgtype=response',
      },
      httpBlock,
    ),
  );
}

function warcAddResource(url, contentType, payload) {
  warcRecords.push(
    warcRecord(
      {
        'WARC-Type': 'resource',
        'WARC-Record-ID': `<urn:uuid:${randomUUID()}>`,
        'WARC-Date': new Date().toISOString(),
        'WARC-Target-URI': url,
        'WARC-Payload-Digest': `sha-256:${sha256(payload)}`,
        'Content-Type': contentType,
      },
      payload,
    ),
  );
}

function warcWrite(outDir, collectedAt) {
  const info = Buffer.from(
    [
      'software: ecode-parity-baseline-collector/2',
      `date: ${collectedAt}`,
      `user-agent: ${RAW_UA}`,
      'note: raw-fetch response records are RECONSTRUCTED from fetch() metadata (status + decoded headers), not wire captures. Rendered pages are resource records (post-JS DOM serialization + screenshot) — the faithful archive of a JS route IS its rendered form.',
    ].join('\r\n') + '\r\n',
    'utf8',
  );

  const all = [
    warcRecord(
      {
        'WARC-Type': 'warcinfo',
        'WARC-Record-ID': `<urn:uuid:${randomUUID()}>`,
        'WARC-Date': collectedAt,
        'Content-Type': 'application/warc-fields',
      },
      info,
    ),
    ...warcRecords,
  ];

  mkdirSync(join(outDir, 'archive'), { recursive: true });

  // One gzip member per record — the multi-member form the WARC spec requires
  // for .warc.gz so records stay individually seekable.
  const gz = Buffer.concat(all.map((record) => gzipSync(record)));
  writeFileSync(join(outDir, 'archive', 'capture.warc.gz'), gz);

  return { file: 'archive/capture.warc.gz', records: all.length, bytes: gz.length, sha256: sha256(gz) };
}

/* ---- capture: raw + rendered --------------------------------------------------- */

async function fetchSource(source) {
  // Transient network errors (no HTTP status at all) get a bounded retry —
  // an HTTP error status is a real answer and is never retried into silence.
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        headers: { 'user-agent': RAW_UA },
        signal: AbortSignal.timeout(60_000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      const headers = Object.fromEntries(response.headers.entries());
      const botWall = detectBotWall(response.status, body.toString('utf8'));

      if (!response.ok) {
        return { source, status: botWall ? 'BLOCKED' : 'FAILED', httpStatus: response.status, error: botWall, body: null };
      }

      return { source, status: 'OK', httpStatus: response.status, body, headers, finalUrl: response.url };
    } catch (error) {
      if (attempt >= 3) {
        return { source, status: 'FAILED', httpStatus: 0, error: String(error?.message ?? error), body: null };
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 3_000));
    }
  }
}

/*
 * Resolve Playwright without depending on a bare 'playwright' being on the
 * module path (pnpm hoists it under .pnpm; CI installs it into PARITY_DEPS).
 * Returns null if unavailable — the collector then records RENDER_UNAVAILABLE
 * rather than faking a render.
 */
function loadChromium() {
  const req = createRequire(import.meta.url);
  const depsDir = process.env.PARITY_DEPS ?? '/tmp/parity-deps';
  const candidates = [
    'playwright',
    '@playwright/test',
    join(repoRoot, 'node_modules/playwright/index.js'),
    join(repoRoot, 'node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.js'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = req(candidate);
      if (mod?.chromium) return mod.chromium;
    } catch {
      // try next
    }
  }

  try {
    const mod = createRequire(join(depsDir, 'noop.js'))('playwright');
    if (mod?.chromium) return mod.chromium;
  } catch {
    // fall through
  }

  return null;
}

/**
 * JS-render the product-route/status sources with a headless browser. A plain
 * fetch of these pages returns only a shell (or an HTTP 403); rendering is
 * the only faithful archive. Sequential, with scroll passes so lazy content
 * (e.g. the community hub's Power Ranking section) actually mounts.
 */
async function renderSources(sourcesToRender) {
  const chromium = loadChromium();

  if (!chromium) {
    return sourcesToRender.map((source) => ({
      source,
      status: 'RENDER_UNAVAILABLE',
      httpStatus: 0,
      error: 'playwright not installed (rendered families need a browser)',
      body: null,
    }));
  }

  const results = [];
  let browser = null;
  let context = null;

  const launch = async () => {
    browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({ userAgent: REALISTIC_UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  };

  try {
    await launch();
  } catch (error) {
    // A browser that cannot even launch (loaded machine, missing deps) is an
    // environment failure — recorded per source, never an uncaught crash.
    return sourcesToRender.map((source) => ({
      source,
      status: 'RENDER_UNAVAILABLE',
      httpStatus: 0,
      error: `chromium launch failed: ${String(error?.message ?? error).split('\n')[0]}`,
      body: null,
    }));
  }

  try {
    for (const source of sourcesToRender) {
      // A mid-run browser crash must not fail every remaining source —
      // relaunch once per source and retry.
      let attempt = 0;

      while (true) {
        attempt += 1;

        if (!browser?.isConnected()) {
          logError(`browser not connected — relaunching before ${source.id}`);
          await browser?.close().catch(() => {});
          await launch();
        }

        try {
          const page = await context.newPage();
          // goto can time out on pages that long-poll (status page) — capture
          // whatever DID load instead of abandoning the source.
          const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
          const httpStatus = response?.status() ?? 0;
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(6_000); // let client render settle

          for (let i = 1; i <= 4; i++) {
            await page.evaluate((fraction) => window.scrollTo(0, (document.body.scrollHeight * fraction) / 4), i);
            await page.waitForTimeout(600);
          }

          // Late-mounting sections (the hub's Power Ranking arrives seconds
          // AFTER networkidle) — wait bounded for the expected markers, then
          // capture whatever is there; the expectation check records honestly.
          if (source.expect) {
            await page
              .waitForFunction(
                (needles) => {
                  const haystack = (document.body.innerText + document.documentElement.outerHTML).toLowerCase();
                  return needles.every((needle) => haystack.includes(needle));
                },
                source.expect.map((needle) => needle.toLowerCase()),
                { timeout: 20_000, polling: 1_000 },
              )
              .catch(() => {});
          }

          const html = await page.evaluate(() => document.documentElement.outerHTML);
          const text = await page.evaluate(() => document.body.innerText);
          const title = await page.title();
          // A screenshot timeout (endless animations) must not lose the DOM
          // capture — degrade to viewport, then to no screenshot, LOUDLY.
          const screenshot = await page
            .screenshot({ fullPage: true, type: 'jpeg', quality: 70, timeout: 45_000, animations: 'disabled' })
            .catch(() =>
              page.screenshot({ fullPage: false, type: 'jpeg', quality: 70, timeout: 15_000, animations: 'disabled' }).catch(() => null),
            );
          if (!screenshot) logError(`screenshot failed for ${source.id} — DOM capture kept, screenshot recorded as MISSING`);
          const finalUrl = page.url();
          await page.close();

          const botWall = detectBotWall(httpStatus, `${title}\n${text}`);

          if (botWall || httpStatus >= 400) {
            results.push({ source, status: 'BLOCKED', httpStatus, error: botWall ?? `http ${httpStatus}`, body: null, renderedText: text });
          } else if (!text.trim() && html.length < 2_000) {
            results.push({ source, status: 'FAILED', httpStatus, error: 'render produced an empty document', body: null });
          } else {
            results.push({
              source, status: 'OK', httpStatus: httpStatus || 200,
              body: Buffer.from(html, 'utf8'), renderedText: text, renderedTitle: title, screenshot, finalUrl,
            });
          }

          break;
        } catch (error) {
          // A crashed browser gets ONE relaunch-and-retry per source; any
          // other error (or a second crash) is recorded as FAILED.
          if (attempt < 2 && !browser?.isConnected()) {
            logError(`browser crashed during ${source.id} — one relaunch-and-retry`);
            continue;
          }

          results.push({ source, status: 'FAILED', httpStatus: 0, error: String(error?.message ?? error), body: null });
          break;
        }
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  return results;
}

/* ---- observation ledger ------------------------------------------------------------ */

function loadLedger() {
  if (!existsSync(ledgerPath)) return [];

  return readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function makeObservation(fields) {
  const criticality = fields.criticality ?? 'P2';
  const slaHours = TRIAGE_SLA_HOURS[criticality];
  const recordedAt = new Date().toISOString();
  const eventDate = fields.eventDate ?? null;
  const detectionDate = fields.detectionDate;
  const gapDays =
    eventDate && detectionDate ? Math.round((Date.parse(detectionDate) - Date.parse(eventDate)) / 86_400_000) : null;

  return {
    id: `auto-${detectionDate}-${fields.dedupKey.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`.slice(0, 120),
    dedupKey: fields.dedupKey,
    type: fields.type,
    sourceType: fields.sourceType,
    sourceId: fields.sourceId ?? null,
    url: fields.url ?? null,
    observedAt: fields.observedAt ?? recordedAt,
    eventDate,
    eventDatePrecision: fields.eventDatePrecision ?? (eventDate ? 'day' : 'unknown'),
    detectionDate,
    detectionGapDays: gapDays,
    contentHash: fields.contentHash ?? null,
    archiveUri: fields.archiveUri ?? null,
    plan: fields.plan ?? 'public',
    region: fields.region ?? 'UNKNOWN',
    client: fields.client ?? 'web',
    rollout: fields.rollout ?? 'UNKNOWN',
    criticality,
    triageSlaHours: slaHours,
    triageDueBy: new Date(Date.now() + slaHours * 3_600_000).toISOString(),
    triageState: fields.triageState ?? 'PENDING',
    summary: fields.summary,
    recordedAt,
  };
}

/* ---- changelog entry + watch-term detection over the on-disk archive ----------------- */

const CHANGELOG_URL_RE = /https:\/\/docs\.replit\.com\/updates\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z0-9-]+/g;

function changelogEntriesIn(text) {
  const out = new Map();

  for (const match of text.matchAll(CHANGELOG_URL_RE)) {
    out.set(match[0], `${match[1]}-${match[2]}-${match[3]}`);
  }

  return out;
}

function snapshotDaysOnDisk() {
  if (!existsSync(snapshotsRoot)) return [];

  return readdirSync(snapshotsRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
}

function snapshotTextBlobs(day) {
  const dir = join(snapshotsRoot, day);
  const blobs = [];

  for (const name of readdirSync(dir)) {
    if (/\.(txt|html|md|xml)$/.test(name) && name !== 'manifest.json') {
      try {
        blobs.push({ file: `docs/parity/baseline/snapshots/${day}/${name}`, text: readFileSync(join(dir, name), 'utf8') });
      } catch {
        // unreadable blob — surfaces as a hash/payload failure elsewhere
      }
    }
  }

  return blobs;
}

/* ---- CLI + collection ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const dateArgIndex = argv.indexOf('--date');
const today = dateArgIndex > -1 && argv[dateArgIndex + 1] ? argv[dateArgIndex + 1] : new Date().toISOString().slice(0, 10);
const rawOnly = argv.includes('--raw-only');
const requireRender = argv.includes('--require-render');

const outDir = join(snapshotsRoot, today);
mkdirSync(outDir, { recursive: true });
mkdirSync(observationsRoot, { recursive: true });

const collectedAt = new Date().toISOString();
const ordered = [...SOURCES].sort((a, b) => a.priority - b.priority);
const robotsByOrigin = {};
const allowedRaw = [];
const allowedRender = [];
const results = [];

for (const source of ordered) {
  const decision = await robotsDecision(source.url);
  robotsByOrigin[new URL(source.url).origin] = decision.policy;

  if (!decision.allowed) {
    results.push({ source, status: 'SKIPPED_ROBOTS', httpStatus: null, error: `robots policy: ${decision.policy}`, body: null });
    logError(`SKIPPED_ROBOTS ${source.id} (${source.url}) policy=${decision.policy}`);
  } else if (source.render) {
    allowedRender.push(source);
  } else {
    allowedRaw.push(source);
  }
}

const [fetched, rendered] = await Promise.all([
  Promise.all(allowedRaw.map((source) => fetchSource(source))),
  rawOnly
    ? Promise.resolve(
        allowedRender.map((source) => ({ source, status: 'RENDER_UNAVAILABLE', httpStatus: 0, error: '--raw-only: rendering skipped', body: null })),
      )
    : renderSources(allowedRender),
]);
results.push(...fetched, ...rendered);

/* ---- persist captures + manifest ---------------------------------------------------------- */

const manifest = {
  schemaVersion: 3,
  collectedAt,
  cadence: 'daily',
  cadenceNote:
    'Replit changelog publishes on ARBITRARY weekdays (llms.txt index includes Sunday 2025-11-16 and Wednesday 2025-11-26). Friday-keyed automation is forbidden. Event-driven runs (workflow_dispatch / repository_dispatch) supplement — never replace — the daily schedule.',
  collector: {
    script: 'scripts/parity/collect-baseline.mjs',
    scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    nodeVersion: process.version,
    rawUserAgent: RAW_UA,
    renderUserAgent: REALISTIC_UA,
  },
  families: FAMILIES,
  authenticatedUiCoverage:
    'NONE AUTOMATED — per-plan/per-region/per-client UI observation requires accounts; manual intake only (docs/parity/baseline/observations/manual/). Coverage beyond public surfaces: UNKNOWN.',
  robotsPolicies: robotsByOrigin,
  watchTerms: WATCH_TERMS,
  watchHits: {}, // term -> [sourceId, ...] (THIS run)
  sources: {},
  expectationFailures: [],
  warc: null,
};

let okCount = 0;

for (const result of results) {
  const { source } = result;

  if (result.status !== 'OK') {
    manifest.sources[source.id] = {
      url: source.url,
      family: source.family,
      status: result.status, // FAILED | BLOCKED | RENDER_UNAVAILABLE | SKIPPED_ROBOTS
      httpStatus: result.httpStatus,
      error: result.error ?? null,
    };
    logError(`${result.status} ${source.id} (${source.url}) http=${result.httpStatus} ${result.error ?? ''}`);
    continue;
  }

  okCount += 1;

  result.body = sanitizeSnapshot(result.body);
  if (result.renderedText) result.renderedText = sanitizeText(result.renderedText);

  const text = result.body.toString('utf8');
  const links = extractLinks(source, text, result.finalUrl);
  writeFileSync(join(outDir, source.file), result.body);
  writeFileSync(join(outDir, `${source.id}.links.txt`), links.slice().sort().join('\n') + '\n');

  // Watch-term + expectation haystack: rendered text AND markup (an href like
  // the gallery's Typeform intake lives in the HTML, not the innerText).
  const haystack = (result.renderedText ? `${result.renderedText}\n${text}` : text).toLowerCase();
  const termsHere = WATCH_TERMS.filter((term) => haystack.includes(term.toLowerCase()));

  for (const term of termsHere) {
    (manifest.watchHits[term] ??= []).push(source.id);
  }

  const entry = {
    url: source.url,
    family: source.family,
    sourceType: source.family,
    status: 'OK',
    rendered: Boolean(source.render),
    httpStatus: result.httpStatus,
    file: source.file,
    sha256: sha256(result.body),
    bytes: result.body.length,

    // eventDate is UNKNOWN for a page snapshot (routes carry no publish
    // date); detectionDate is when WE captured it — the pair makes blindness
    // measurable. Dated events (changelog entries) get real eventDates in the
    // observation ledger below.
    eventDate: 'UNKNOWN',
    detectionDate: manifest.collectedAt,

    // A property of THIS snapshot — never a constant.
    linkCount: links.length,
    watchTerms: termsHere,
  };

  if (source.render) {
    const textFile = `${source.id}.rendered.txt`;
    writeFileSync(join(outDir, textFile), result.renderedText);
    entry.renderedTitle = result.renderedTitle;
    entry.renderedTextChars = result.renderedText.length;
    entry.renderedTextFile = textFile;
    entry.renderedTextSha256 = sha256(Buffer.from(result.renderedText, 'utf8'));
    warcAddResource(source.url, 'text/html; note=rendered-dom', result.body);

    if (result.screenshot) {
      const shotFile = `${source.id}.rendered.jpg`;
      writeFileSync(join(outDir, shotFile), result.screenshot);
      entry.screenshotFile = shotFile;
      entry.screenshotSha256 = sha256(result.screenshot);
      warcAddResource(`${source.url}#screenshot`, 'image/jpeg', result.screenshot);
    } else {
      entry.screenshotFile = null;
      entry.screenshotNote = 'screenshot MISSING (timed out) — DOM capture is authoritative';
    }
  } else {
    warcAddResponse(result.finalUrl ?? source.url, result.httpStatus, result.headers, result.body);
  }

  // Non-regression expectations (case-insensitive contains).
  if (source.expect) {
    const failed = source.expect.filter((needle) => !haystack.includes(needle.toLowerCase()));
    entry.expectations = { checked: source.expect.length, failed };

    for (const needle of failed) {
      manifest.expectationFailures.push({ sourceId: source.id, missing: needle });
    }
  }

  // Measured gallery metrics — snapshot properties, never constants.
  if (source.id === 'gallery') {
    const resultsMatch = (result.renderedText ?? '').match(/(\d[\d,]*)\s+Results/);
    const categoryPaths = new Set([...text.matchAll(/href="(\/gallery\/[a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]));
    const appDetailPaths = new Set([...text.matchAll(/href="(\/gallery\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]));
    entry.metrics = {
      resultsCount: resultsMatch ? Number(resultsMatch[1].replace(/,/g, '')) : 'UNKNOWN',
      categoryPageLinks: categoryPaths.size,
      appDetailPageLinks: appDetailPaths.size,
    };
  }

  manifest.sources[source.id] = entry;

  log(
    `OK ${source.id} [${source.family}${source.render ? '/rendered' : ''}] bytes=${entry.bytes} links=${entry.linkCount}${entry.renderedTextChars != null ? ` renderedText=${entry.renderedTextChars}` : ''}${termsHere.length ? ` watch=${termsHere.join('|')}` : ''} sha256=${entry.sha256.slice(0, 16)}…`,
  );
}

if (okCount === 0) {
  logError('every fetch failed — no snapshot written');
  process.exit(1);
}

/* ---- observations: changelog entries, watch terms, regressions, walls, manual ------------- */

const ledger = loadLedger();
const known = new Set(ledger.map((observation) => observation.dedupKey));
const newObservations = [];

function addObservation(fields) {
  if (known.has(fields.dedupKey)) return;

  const observation = makeObservation(fields);
  known.add(fields.dedupKey);
  newObservations.push(observation);
}

// -- 1. changelog entries. eventDate = the date in the URL; detectionDate =
//       the EARLIEST snapshot on disk whose captures contain the URL —
//       measured backfill from the archive, never invented.
const entryFirstSeen = new Map(); // url -> { eventDate, firstDay, evidence }

for (const day of snapshotDaysOnDisk()) {
  for (const blob of snapshotTextBlobs(day)) {
    for (const [url, eventDate] of changelogEntriesIn(blob.text)) {
      if (!entryFirstSeen.has(url)) entryFirstSeen.set(url, { eventDate, firstDay: day, evidence: blob.file });
    }
  }
}

const RECENT_WINDOW_DAYS = 30;
let changelogFetchBudget = 10;

for (const [url, { eventDate, firstDay, evidence }] of [...entryFirstSeen.entries()].sort((a, b) => b[1].eventDate.localeCompare(a[1].eventDate))) {
  const dedupKey = `changelog:${eventDate}:${url}`;
  if (known.has(dedupKey)) continue;

  const ageDays = Math.round((Date.parse(today) - Date.parse(eventDate)) / 86_400_000);
  const recent = ageDays <= RECENT_WINDOW_DAYS;
  let summary = `Changelog entry ${eventDate} (${url}) first captured in snapshot ${firstDay} (${evidence}).`;
  let contentHash = null;
  let archiveUri = null;

  // Archive the entry markdown for recent entries (bounded; trims are logged).
  if (recent && changelogFetchBudget > 0) {
    changelogFetchBudget -= 1;
    const mdResult = await fetchSource({ id: `changelog-entry-${eventDate}`, url: `${url}.md` });

    if (mdResult.status === 'OK') {
      const dir = join(outDir, 'changelog-entries');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${eventDate}.md`), sanitizeSnapshot(mdResult.body));
      contentHash = `sha256:${sha256(mdResult.body)}`;
      archiveUri = `docs/parity/baseline/snapshots/${today}/changelog-entries/${eventDate}.md`;
      warcAddResponse(`${url}.md`, 200, mdResult.headers, mdResult.body);

      const headlines = [...mdResult.body.toString('utf8').matchAll(/^### (.+)$/gm)].map((match) => match[1]);
      if (headlines.length > 0) summary += ` Items: ${headlines.join(' · ')}.`;
    } else {
      summary += ` Entry .md fetch ${mdResult.status} (http=${mdResult.httpStatus}).`;
    }
  } else if (recent) {
    log(`changelog-entry fetch budget exhausted — ${url} NOT archived this run (retried next run)`);
  }

  addObservation({
    dedupKey,
    type: 'CHANGELOG_ENTRY',
    sourceType: 'launch-channel',
    sourceId: 'changelog-index',
    url,
    eventDate,
    eventDatePrecision: 'day',
    detectionDate: firstDay,
    contentHash,
    archiveUri,
    criticality: recent ? 'P1' : 'P2',
    // Entries older than the recency window predate the parity program —
    // archived for the record, no live triage SLA.
    triageState: recent ? 'PENDING' : 'ARCHIVED_BACKFILL',
    summary,
  });
}

// -- 2. watch terms across the whole on-disk archive (chronological, so the
//       first-detection date is measured).
const termFirstSeen = new Map(); // term -> { day, file }
const termHitDays = new Map(); // term -> Set(day)

for (const day of snapshotDaysOnDisk()) {
  for (const blob of snapshotTextBlobs(day)) {
    const lower = blob.text.toLowerCase();

    for (const term of WATCH_TERMS) {
      if (!lower.includes(term.toLowerCase())) continue;
      if (!termFirstSeen.has(term)) termFirstSeen.set(term, { day, file: blob.file });
      (termHitDays.get(term) ?? termHitDays.set(term, new Set()).get(term)).add(day);
    }
  }
}

manifest.watchTermLedger = {};

for (const term of WATCH_TERMS) {
  const first = termFirstSeen.get(term) ?? null;
  manifest.watchTermLedger[term] = first
    ? { firstDetection: first.day, firstEvidence: first.file, daysSeen: termHitDays.get(term).size }
    : { firstDetection: null, note: 'NEVER SEEN in any captured source — a measured coverage gap, not silence' };

  if (first) {
    addObservation({
      dedupKey: `watch-term:${term.toLowerCase()}`,
      type: 'WATCH_TERM_FIRST_SEEN',
      sourceType: 'product-route',
      url: null,
      eventDate: null,
      eventDatePrecision: 'unknown',
      detectionDate: first.day,
      archiveUri: first.file,
      criticality: 'P1',
      summary: `Watch term "${term}" first present in ${first.file} (snapshot ${first.day}). eventDate UNKNOWN — the launch date is not derivable from the capture itself.`,
    });
  }
}

manifest.watchTermsNeverSeen = WATCH_TERMS.filter((term) => !termFirstSeen.has(term));

// -- 3. expectation regressions
for (const failure of manifest.expectationFailures) {
  addObservation({
    dedupKey: `expectation:${today}:${failure.sourceId}:${failure.missing}`,
    type: 'EXPECTATION_REGRESSION',
    sourceType: manifest.sources[failure.sourceId]?.family ?? 'UNKNOWN',
    sourceId: failure.sourceId,
    url: manifest.sources[failure.sourceId]?.url ?? null,
    detectionDate: today,
    criticality: 'P1',
    summary: `Non-regression check failed: "${failure.missing}" missing from the ${failure.sourceId} capture of ${today}.`,
  });
}

// -- 4. first successful capture of each source (per source id + mode)
for (const [id, entry] of Object.entries(manifest.sources)) {
  if (entry.status !== 'OK') continue;

  addObservation({
    dedupKey: `first-capture:${id}:${entry.rendered ? 'rendered' : 'raw'}`,
    type: 'SOURCE_FIRST_CAPTURE',
    sourceType: entry.family,
    sourceId: id,
    url: entry.url,
    detectionDate: today,
    contentHash: `sha256:${entry.sha256}`,
    archiveUri: `docs/parity/baseline/snapshots/${today}/${entry.file}`,
    criticality: 'P2',
    client: SOURCES.find((source) => source.id === id)?.client ?? 'web',
    summary: `First capture of ${id} (${entry.rendered ? 'rendered' : 'raw'}${entry.renderedTextChars != null ? `, renderedText=${entry.renderedTextChars} chars` : ''}, watch=[${(entry.watchTerms ?? []).join('|')}]).`,
  });
}

// -- 5. blocked/unreachable sources are observations too — a wall is an event.
for (const [id, entry] of Object.entries(manifest.sources)) {
  if (['BLOCKED', 'SKIPPED_ROBOTS', 'RENDER_UNAVAILABLE'].includes(entry.status)) {
    addObservation({
      dedupKey: `blocked:${today}:${id}:${entry.status}`,
      type: 'SOURCE_BLOCKED',
      sourceType: entry.family,
      sourceId: id,
      url: entry.url,
      detectionDate: today,
      criticality: 'P1',
      summary: `${entry.status} on ${id}: ${entry.error ?? 'no detail'} — a coverage hole until resolved.`,
    });
  }
}

// -- 6. manual authenticated-ui intake (validated, merged, deduped)
if (existsSync(manualDir)) {
  for (const name of readdirSync(manualDir).filter((fileName) => fileName.endsWith('.jsonl'))) {
    const lines = readFileSync(join(manualDir, name), 'utf8').split('\n').filter(Boolean);

    for (const [index, line] of lines.entries()) {
      let parsed;

      try {
        parsed = JSON.parse(line);
      } catch {
        logError(`manual intake ${name}:${index + 1} — invalid JSON, IGNORED`);
        continue;
      }

      if (parsed.sourceType !== 'authenticated-ui' || !parsed.summary || !parsed.plan || !parsed.client) {
        logError(`manual intake ${name}:${index + 1} — needs sourceType=authenticated-ui + plan + client + summary, IGNORED`);
        continue;
      }

      addObservation({
        dedupKey: `manual:${name}:${index}`,
        type: 'MANUAL',
        sourceType: 'authenticated-ui',
        sourceId: parsed.sourceId ?? null,
        url: parsed.url ?? null,
        observedAt: parsed.observedAt,
        eventDate: parsed.eventDate ?? null,
        eventDatePrecision: parsed.eventDatePrecision ?? 'unknown',
        detectionDate: parsed.detectionDate ?? today,
        contentHash: parsed.contentHash ?? null,
        archiveUri: parsed.archiveUri ?? null,
        plan: parsed.plan,
        region: parsed.region ?? 'UNKNOWN',
        client: parsed.client,
        rollout: parsed.rollout ?? 'UNKNOWN',
        criticality: parsed.criticality ?? 'P1',
        summary: parsed.summary,
      });
    }
  }
}

/* ---- ledger write + WARC + manifest --------------------------------------------------------- */

if (newObservations.length > 0) {
  appendFileSync(ledgerPath, newObservations.map((observation) => JSON.stringify(observation)).join('\n') + '\n');
}

const fullLedger = [...ledger, ...newObservations];
const pendingObservations = fullLedger.filter((observation) => observation.triageState === 'PENDING');
const overdueObservations = pendingObservations.filter((observation) => Date.parse(observation.triageDueBy) < Date.now());

manifest.observations = {
  ledger: 'docs/parity/baseline/observations/ledger.jsonl',
  total: fullLedger.length,
  newThisRun: newObservations.length,
  pendingTriage: pendingObservations.length,
  overdueTriage: overdueObservations.length,
  slaHoursByCriticality: TRIAGE_SLA_HOURS,
};

manifest.warc = warcWrite(outDir, collectedAt);

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

log(
  `observations: +${newObservations.length} new, ${pendingObservations.length} PENDING, ${overdueObservations.length} OVERDUE (SLA P0=${TRIAGE_SLA_HOURS.P0}h P1=${TRIAGE_SLA_HOURS.P1}h P2=${TRIAGE_SLA_HOURS.P2}h)`,
);

const OBSERVATION_DISPLAY_CAP = 40;

for (const observation of newObservations.slice(0, OBSERVATION_DISPLAY_CAP)) {
  log(
    `  NEW ${observation.type} [${observation.criticality}/${observation.triageState}] event=${observation.eventDate ?? 'UNKNOWN'} detected=${observation.detectionDate} gap=${observation.detectionGapDays ?? 'n/a'}d — ${observation.summary.slice(0, 160)}`,
  );
}

if (newObservations.length > OBSERVATION_DISPLAY_CAP) {
  log(`  … ${newObservations.length - OBSERVATION_DISPLAY_CAP} more written to the ledger (cap trims DISPLAY only)`);
}

if (manifest.watchTermsNeverSeen.length > 0) {
  log(`WATCH TERMS NEVER SEEN (measured coverage gap): ${manifest.watchTermsNeverSeen.join(' · ')}`);
}

if (manifest.expectationFailures.length > 0) {
  logError(`EXPECTATION FAILURES: ${manifest.expectationFailures.map((failure) => `${failure.sourceId}:"${failure.missing}"`).join(', ')}`);
}

/* ---- sorted diff vs the previous snapshot ---------------------------------------------------- */

function latestPreviousSnapshotDir(todayDir) {
  const dirs = snapshotDaysOnDisk().filter((name) => name !== todayDir);

  return dirs.length > 0 ? join(snapshotsRoot, dirs[dirs.length - 1]) : undefined;
}

const previousDir = latestPreviousSnapshotDir(today);

if (!previousDir) {
  log('first snapshot — no previous snapshot to diff against');
} else {
  const previousManifest = JSON.parse(readFileSync(join(previousDir, 'manifest.json'), 'utf8'));
  log(`diff vs ${previousDir.split('/').pop()}:`);

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

log(`snapshot written to ${outDir}`);

if (requireRender) {
  const renderEntries = Object.entries(manifest.sources).filter(([id]) => SOURCES.find((source) => source.id === id)?.render);
  const gated = renderEntries.filter(([id]) => !SOURCES.find((source) => source.id === id)?.renderGateExempt);
  const exemptNotOk = renderEntries.filter(
    ([id, entry]) => SOURCES.find((source) => source.id === id)?.renderGateExempt && entry.status !== 'OK',
  );
  const notOk = gated.filter(([, entry]) => entry.status !== 'OK');

  for (const [id, entry] of exemptNotOk) {
    log(`--require-render: ${id}=${entry.status} (renderGateExempt — recorded as a coverage hole, does not gate CI)`);
  }

  if (notOk.length > 0) {
    logError(
      `--require-render: ${notOk.length}/${gated.length} gated rendered source(s) not OK: ${notOk.map(([id, entry]) => `${id}=${entry.status}`).join(', ')}`,
    );
    process.exit(2);
  }

  log(`--require-render: all ${gated.length} gated rendered sources OK (JS rendering PROVEN in this environment)`);
}
