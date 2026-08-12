import { isAbsolute, relative, resolve, sep } from 'node:path';

export const SOLUTION_SLUGS = Object.freeze([
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'startups',
  'freelancers',
  'enterprise',
]);

/*
 * App Builder is the visual/content reference. It is intentionally kept out of
 * the final counters, which cover only the eight pages still awaiting live proof.
 */
export const REFERENCE_SOLUTION_SLUG = 'app-builder';

export const LANGUAGES = Object.freeze(['en', 'fr']);
export const THEMES = Object.freeze(['light', 'dark']);
export const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 390, height: 844, label: 'mobile' }),
  Object.freeze({ width: 768, height: 1024, label: 'tablet' }),
  Object.freeze({ width: 1024, height: 900, label: 'desktop' }),
  Object.freeze({ width: 1440, height: 1000, label: 'wide' }),
]);
export const SCREENSHOT_WIDTHS = Object.freeze([390, 768, 1440]);

export const EXPECTED_MATRIX_ROWS = 128;
export const EXPECTED_SCREENSHOTS = 96;
export const DEFAULT_OUTPUT_DIRECTORY = 'docs/deploy-evidence/solutions-final';

const LOCAL_HOSTNAMES = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1']);
const RESERVED_EXAMPLE_HOSTS = /(^|\.)example\.(com|net|org)$/i;

const PRIVATE_HOST_SUFFIXES = ['.example', '.home', '.internal', '.invalid', '.lan', '.local', '.localhost', '.test'];

function parseBoolean(value, name) {
  if (value === undefined) {
    return false;
  }

  if (value === true || value === '1' || value === 'true') {
    return true;
  }

  if (value === false || value === '0' || value === 'false' || value === '') {
    return false;
  }

  throw new Error(`${name} must be one of: 1, 0, true, false`);
}

function parseInteger(value, name, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || String(parsed) !== String(value) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return parsed;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

export function parseArguments(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--allow-local') {
      parsed.allowLocal = true;
    } else if (argument === '--headed') {
      parsed.headed = true;
    } else if (argument === '--help' || argument === '-h') {
      parsed.help = true;
    } else if (argument === '--base-url') {
      parsed.baseUrl = optionValue(argv, index, argument);
      index += 1;
    } else if (argument.startsWith('--base-url=')) {
      parsed.baseUrl = argument.slice('--base-url='.length);
    } else if (argument === '--output-dir') {
      parsed.outputDirectory = optionValue(argv, index, argument);
      index += 1;
    } else if (argument.startsWith('--output-dir=')) {
      parsed.outputDirectory = argument.slice('--output-dir='.length);
    } else if (argument === '--workers') {
      parsed.workers = optionValue(argv, index, argument);
      index += 1;
    } else if (argument.startsWith('--workers=')) {
      parsed.workers = argument.slice('--workers='.length);
    } else if (argument === '--timeout-ms') {
      parsed.timeoutMs = optionValue(argv, index, argument);
      index += 1;
    } else if (argument.startsWith('--timeout-ms=')) {
      parsed.timeoutMs = argument.slice('--timeout-ms='.length);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return parsed;
}

export function isLocalHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipv4Octets = normalized.split('.').map((part) => Number.parseInt(part, 10));

  const isIpv4 =
    ipv4Octets.length === 4 &&
    ipv4Octets.every(
      (octet, index) =>
        Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === normalized.split('.')[index],
    );

  if (isIpv4) {
    const [first, second, third] = ipv4Octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }

  if (normalized.includes(':')) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89a-f]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8') ||
      normalized.startsWith('::ffff:')
    );
  }

  return (
    LOCAL_HOSTNAMES.has(normalized) ||
    !normalized.includes('.') ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

export function normalizeBaseUrl(rawBaseUrl, { allowLocal = false } = {}) {
  if (!rawBaseUrl?.trim()) {
    throw new Error(
      'A deployed base URL is required. Set SOLUTIONS_PROOF_BASE_URL or pass --base-url; use --allow-local only for an explicit local rehearsal.',
    );
  }

  let url;

  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error(`Invalid base URL: ${rawBaseUrl}`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The base URL cannot contain credentials, a query string, or a fragment');
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('The base URL must be an origin without a path');
  }

  const local = isLocalHostname(url.hostname);

  if (local && !allowLocal) {
    throw new Error(
      'Local, private, link-local, and otherwise non-public base URLs are rejected by default; pass --allow-local or set SOLUTIONS_PROOF_ALLOW_LOCAL=1 for a rehearsal',
    );
  }

  if (!local && url.protocol !== 'https:') {
    throw new Error('A deployed proof URL must use HTTPS');
  }

  if (local && !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('A local proof URL must use HTTP or HTTPS');
  }

  if (RESERVED_EXAMPLE_HOSTS.test(url.hostname)) {
    throw new Error('Reserved example domains cannot be used as proof deployments');
  }

  return Object.freeze({
    value: url.origin,
    origin: url.origin,
    local,
  });
}

export function resolveEvidenceDirectory(cwd, requestedDirectory = DEFAULT_OUTPUT_DIRECTORY) {
  const repositoryRoot = resolve(cwd);
  const docsRoot = resolve(repositoryRoot, 'docs');
  const outputDirectory = resolve(repositoryRoot, requestedDirectory);
  const pathFromDocs = relative(docsRoot, outputDirectory);

  const outsideDocs = pathFromDocs === '..' || pathFromDocs.startsWith(`..${sep}`) || isAbsolute(pathFromDocs);

  if (!pathFromDocs || outsideDocs) {
    throw new Error('The proof output directory must be a descendant of the repository docs/ directory');
  }

  return Object.freeze({
    absolute: outputDirectory,
    relative: relative(repositoryRoot, outputDirectory).split(sep).join('/'),
  });
}

export function loadHarnessConfig({ argv = [], env = process.env, cwd = process.cwd() } = {}) {
  const options = parseArguments(argv);
  const allowLocal = options.allowLocal ?? parseBoolean(env.SOLUTIONS_PROOF_ALLOW_LOCAL, 'SOLUTIONS_PROOF_ALLOW_LOCAL');
  const base = normalizeBaseUrl(options.baseUrl ?? env.SOLUTIONS_PROOF_BASE_URL, { allowLocal });

  const output = resolveEvidenceDirectory(
    cwd,
    options.outputDirectory ?? env.SOLUTIONS_PROOF_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
  );

  const workers = parseInteger(options.workers ?? env.SOLUTIONS_PROOF_WORKERS ?? '2', 'workers', 1, 8);

  const timeoutMs = parseInteger(
    options.timeoutMs ?? env.SOLUTIONS_PROOF_TIMEOUT_MS ?? '60000',
    'timeout-ms',
    5_000,
    180_000,
  );

  const headed = options.headed ?? parseBoolean(env.SOLUTIONS_PROOF_HEADED, 'SOLUTIONS_PROOF_HEADED');

  return Object.freeze({
    baseUrl: base.value,
    deployed: !base.local,
    allowLocal,
    outputDirectory: output.absolute,
    outputDirectoryRelative: output.relative,
    workers,
    timeoutMs,
    headed,
  });
}

export function screenshotFilename({ slug, language, theme, viewport }) {
  return `${slug}--${language}--${theme}--${viewport.width}.png`;
}

export function rowIdentifier({ slug, language, theme, viewport }) {
  return `${slug}--${language}--${theme}--${viewport.width}`;
}

export function buildProofMatrix() {
  const screenshotWidths = new Set(SCREENSHOT_WIDTHS);

  const rows = SOLUTION_SLUGS.flatMap((slug) =>
    LANGUAGES.flatMap((language) =>
      THEMES.flatMap((theme) =>
        VIEWPORTS.map((viewport) => {
          const row = { slug, language, theme, viewport };
          const captureScreenshot = screenshotWidths.has(viewport.width);

          return Object.freeze({
            ...row,
            id: rowIdentifier(row),
            captureScreenshot,
            screenshot: captureScreenshot ? `screenshots/${screenshotFilename(row)}` : null,
          });
        }),
      ),
    ),
  );

  validateProofMatrix(rows);

  return Object.freeze(rows);
}

export function validateProofMatrix(rows) {
  if (rows.length !== EXPECTED_MATRIX_ROWS) {
    throw new Error(`Proof matrix must contain exactly ${EXPECTED_MATRIX_ROWS} rows; received ${rows.length}`);
  }

  const identifiers = new Set(rows.map((row) => row.id));

  if (identifiers.size !== rows.length) {
    throw new Error('Proof matrix row identifiers must be unique');
  }

  const screenshots = rows.filter((row) => row.captureScreenshot);

  if (screenshots.length !== EXPECTED_SCREENSHOTS) {
    throw new Error(
      `Proof matrix must request exactly ${EXPECTED_SCREENSHOTS} screenshots; received ${screenshots.length}`,
    );
  }

  if (rows.some((row) => row.slug === REFERENCE_SOLUTION_SLUG)) {
    throw new Error('App Builder is a reference control and must remain outside the final proof counters');
  }

  return true;
}

export function solutionUrl(baseUrl, slug, language) {
  const url = new URL(`/solutions/${slug}`, baseUrl);
  url.searchParams.set('lang', language);

  return url.href;
}

export function normalizeAssetUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
}

export function usageText() {
  return `Usage:
  SOLUTIONS_PROOF_BASE_URL=https://<deployed-host> node scripts/capture-solutions-final-proof.mjs

Options:
  --base-url <origin>   Deployed HTTPS origin (required; env: SOLUTIONS_PROOF_BASE_URL)
  --output-dir <path>  Descendant of docs/ (default: ${DEFAULT_OUTPUT_DIRECTORY})
  --workers <1-8>      Isolated browser contexts in parallel (default: 2)
  --timeout-ms <ms>    Per-operation timeout, 5000-180000 (default: 60000)
  --headed             Show Chromium (env: SOLUTIONS_PROOF_HEADED=1)
  --allow-local        Explicitly permit a local/non-public rehearsal (env: SOLUTIONS_PROOF_ALLOW_LOCAL=1)
  --help               Print this help

The process exits nonzero unless all 128 rows and all 96 required screenshots pass.`;
}
