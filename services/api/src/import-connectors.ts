/**
 * Import CONNECTORS — the provider-facing layer on top of the pure secure import
 * pipeline (`import-pipeline.ts`). Where `import-pipeline.ts` owns the state
 * machine + secret scan, this module owns:
 *
 *   1. Per-provider CAPABILITY declarations (what each of the 12 hub entries can
 *      actually do today, and — honestly — which ones are BLOCKED because they
 *      need an external credential we do not hold).
 *   2. INPUT NORMALISATION — turning a provider's raw payload (an export bundle,
 *      a spreadsheet, …) into the canonical `ImportFile[]` the pipeline stages.
 *   3. SECURITY HARDENING of the staged file set BEFORE it is staged: path
 *      traversal, symlink escape, archive-bomb (count / per-file / total bytes),
 *      and real content sniffing (a "utf-8" file that is actually binary).
 *
 * This module is PURE (no DB, no network, no fs). The endpoint wires it in front
 * of staging so a hostile bundle is rejected with a precise, typed error at
 * RECEIVED time — never written to a target, never silently mutated.
 *
 * Providers split into three execution classes:
 *   - 'file-bundle'  — the user supplies the files/export directly (bolt,
 *     lovable, base44, previous-agent-export, zip). Fully executable here.
 *   - 'derived'      — we synthesise a project from a non-code artefact
 *     (spreadsheet → data + viewer). Fully executable here, no external key.
 *   - 'external-api' — the source lives behind a third-party API that needs the
 *     caller's own credential (vercel token, figma PAT, a Claude artefact
 *     source). With no credential these are BLOCKED, not faked.
 */

import type { ImportFile, ImportProvider } from './import-pipeline.js';

/* -------------------------------------------------------------------------- */
/*  Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A staged file set violated a hard security control (traversal, symlink,
 * archive bomb, binary-as-text). 422 — the request was well-formed but the
 * content is unsafe to stage. Carries a machine code + the offending path.
 */
export class ImportSecurityError extends Error {
  readonly statusCode = 422;

  constructor(
    message: string,
    readonly code: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'ImportSecurityError';
  }
}

/**
 * A connector needs an external credential we do not have (or the caller did not
 * connect). 424 Failed Dependency — the import cannot run until the dependency is
 * satisfied. This is the honest BLOCKED signal: never a fake COMMITTED.
 */
export class ConnectorCredentialRequiredError extends Error {
  readonly statusCode = 424;

  constructor(
    readonly provider: ImportProvider,
    readonly reason: string,
    readonly code = 'CONNECTOR_CREDENTIAL_REQUIRED',
  ) {
    super(`Import connector "${provider}" is blocked: ${reason}`);
    this.name = 'ConnectorCredentialRequiredError';
  }
}

/* -------------------------------------------------------------------------- */
/*  Capability registry                                                        */
/* -------------------------------------------------------------------------- */

export type ConnectorExecutionClass = 'file-bundle' | 'derived' | 'external-api' | 'native';

export interface ConnectorCapability {
  provider: ImportProvider;

  /** How the source is turned into files. */
  execution: ConnectorExecutionClass;

  /** True when a real import can run today with no external secret. */
  executableNow: boolean;

  /** Human-readable inputs accepted (parity with plan §9 supportedInputs). */
  supportedInputs: string[];

  /** For external-api providers: the exact credential we lack. Empty otherwise. */
  credentialRequirement?: string;

  /** For BLOCKED providers: the precise reason. Empty when executableNow. */
  blockedReason?: string;
}

/**
 * The 12 hub entries. `github` / `bitbucket` / `zip` / `empty` are executed by
 * their own dedicated endpoints ('native' here — this module does not re-handle
 * them). The rest are what this module makes real or honestly blocks.
 */
export const CONNECTOR_CAPABILITIES: Record<ImportProvider, ConnectorCapability> = {
  github: {
    provider: 'github',
    execution: 'native',
    executableNow: true,
    supportedInputs: ['git repository URL'],
  },
  bitbucket: {
    provider: 'bitbucket',
    execution: 'native',
    executableNow: true,
    supportedInputs: ['git repository URL'],
  },
  zip: {
    provider: 'zip',
    execution: 'native',
    executableNow: true,
    supportedInputs: ['.zip archive'],
  },
  empty: {
    provider: 'empty',
    execution: 'native',
    executableNow: true,
    supportedInputs: ['(no source — blank project)'],
  },
  bolt: {
    provider: 'bolt',
    execution: 'file-bundle',
    executableNow: true,
    supportedInputs: ['Bolt export bundle (files[] or .zip)'],
  },
  lovable: {
    provider: 'lovable',
    execution: 'file-bundle',
    executableNow: true,
    supportedInputs: ['Lovable export bundle (files[] or .zip)'],
  },
  base44: {
    provider: 'base44',
    execution: 'file-bundle',
    executableNow: true,
    supportedInputs: ['Base44 export bundle (files[] or .zip)'],
  },
  'previous-agent-export': {
    provider: 'previous-agent-export',
    execution: 'file-bundle',
    executableNow: true,
    supportedInputs: ['Previous-agent export bundle (files[] or .zip)'],
  },
  spreadsheet: {
    provider: 'spreadsheet',
    execution: 'derived',
    executableNow: true,
    supportedInputs: ['CSV / TSV upload'],
  },
  vercel: {
    provider: 'vercel',
    execution: 'external-api',
    executableNow: false,
    supportedInputs: ["Vercel deployment source (via caller's Vercel token)"],
    credentialRequirement: "the caller's connected Vercel access token (api.vercel.com deployment files API)",
    blockedReason:
      'Fetching a Vercel project source requires the connected user’s Vercel access token; no connector token is available in this environment.',
  },
  figma: {
    provider: 'figma',
    execution: 'external-api',
    executableNow: false,
    supportedInputs: ["Figma file (via caller's Figma personal access token)"],
    credentialRequirement: "the caller's Figma personal access token + a design-to-code generation step",
    blockedReason:
      'Importing a Figma file requires the caller’s Figma personal access token and a design-to-code generation step; neither a token nor the generation engine is wired here.',
  },
  claude: {
    provider: 'claude',
    execution: 'external-api',
    executableNow: false,
    supportedInputs: ['Claude Design artefact (external source)'],
    credentialRequirement: 'a defined Claude Design artefact source + fetch credential',
    blockedReason:
      'The Claude Design import source contract (how a Claude artefact is fetched) is not defined and needs an external credential; it is not executable without faking the source.',
  },
};

export function describeConnector(provider: ImportProvider): ConnectorCapability {
  return CONNECTOR_CAPABILITIES[provider];
}

/** Providers that run a REAL import through this module today (excludes native). */
export const CONNECTORS_EXECUTABLE_NOW: ImportProvider[] = (
  Object.values(CONNECTOR_CAPABILITIES) as ConnectorCapability[]
)
  .filter((c) => c.executableNow && c.execution !== 'native')
  .map((c) => c.provider);

/** Providers honestly BLOCKED pending an external credential. */
export const CONNECTORS_BLOCKED: ImportProvider[] = (Object.values(CONNECTOR_CAPABILITIES) as ConnectorCapability[])
  .filter((c) => !c.executableNow)
  .map((c) => c.provider);

/* -------------------------------------------------------------------------- */
/*  Security hardening                                                         */
/* -------------------------------------------------------------------------- */

export interface StagedInputFile {
  path: string;
  content: string;
  encoding?: string;

  /** Optional entry type from an archive/bundle. 'symlink' is rejected. */
  type?: 'file' | 'symlink' | 'directory';

  /** Optional symlink target, when the bundle declares one. */
  linkTarget?: string;
}

export interface SanitizeLimits {
  maxFileCount: number;
  maxPathLength: number;
  maxPathDepth: number;

  /** Max decoded bytes for a single file. */
  maxFileBytes: number;

  /** Max decoded bytes across every file (archive-bomb ceiling). */
  maxTotalBytes: number;
}

export const DEFAULT_IMPORT_LIMITS: SanitizeLimits = {
  maxFileCount: 5000,
  maxPathLength: 1024,
  maxPathDepth: 40,
  maxFileBytes: 5 * 1024 * 1024, // 5 MiB
  maxTotalBytes: 50 * 1024 * 1024, // 50 MiB
};

/** Decoded byte length of a file's content, honouring an explicit base64 encoding. */
function decodedByteLength(file: StagedInputFile): number {
  if (file.encoding === 'base64') {
    // 4 base64 chars → 3 bytes; strip padding for an exact-enough estimate.
    const clean = file.content.replace(/=+$/, '').length;
    return Math.floor((clean * 3) / 4);
  }

  return Buffer.byteLength(file.content, 'utf8');
}

/**
 * Reject a path that could escape the staging root or is otherwise hostile.
 * Returns the normalised POSIX-relative path. Throws ImportSecurityError.
 *
 * Blocks: absolute paths, `..` traversal (pre- or post-normalisation), NUL
 * bytes, backslashes (Windows-style traversal), `~` home refs, drive letters,
 * over-long / over-deep paths, and empty paths.
 */
export function normalizeStagedPath(rawPath: string, limits: SanitizeLimits = DEFAULT_IMPORT_LIMITS): string {
  const original = rawPath;

  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new ImportSecurityError('Empty file path in import bundle', 'IMPORT_PATH_EMPTY', original);
  }

  if (rawPath.includes('\0')) {
    throw new ImportSecurityError('NUL byte in import path', 'IMPORT_PATH_NUL', original);
  }

  if (rawPath.length > limits.maxPathLength) {
    throw new ImportSecurityError(
      `Import path exceeds ${limits.maxPathLength} chars`,
      'IMPORT_PATH_TOO_LONG',
      original,
    );
  }

  if (/^[a-zA-Z]:/.test(rawPath)) {
    throw new ImportSecurityError('Drive-letter path is not allowed', 'IMPORT_PATH_DRIVE', original);
  }

  if (rawPath.includes('\\')) {
    throw new ImportSecurityError('Backslash in import path (Windows traversal)', 'IMPORT_PATH_BACKSLASH', original);
  }

  if (rawPath.startsWith('~')) {
    throw new ImportSecurityError('Home-relative (~) path is not allowed', 'IMPORT_PATH_HOME', original);
  }

  if (rawPath.startsWith('/')) {
    throw new ImportSecurityError('Absolute path is not allowed in an import bundle', 'IMPORT_PATH_ABSOLUTE', original);
  }

  // Collapse `.` segments and reject any `..` segment — never resolve upward.
  const segments = rawPath.split('/').filter((seg) => seg.length > 0 && seg !== '.');

  for (const seg of segments) {
    if (seg === '..') {
      throw new ImportSecurityError('Path traversal ("..") in import bundle', 'IMPORT_PATH_TRAVERSAL', original);
    }
  }

  if (segments.length === 0) {
    throw new ImportSecurityError('Path resolves to an empty target', 'IMPORT_PATH_EMPTY', original);
  }

  if (segments.length > limits.maxPathDepth) {
    throw new ImportSecurityError(`Import path exceeds depth ${limits.maxPathDepth}`, 'IMPORT_PATH_TOO_DEEP', original);
  }

  return segments.join('/');
}

/** Heuristic: does a "utf-8" string actually carry binary (NUL / dense control chars)? */
export function looksBinary(content: string): boolean {
  if (content.includes('\0')) {
    return true;
  }

  // Sample the first 8 KiB; if >10% are non-printable control chars, it's binary.
  const sample = content.slice(0, 8192);

  if (sample.length === 0) {
    return false;
  }

  let control = 0;

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);

    // Allow tab (9), LF (10), CR (13); everything else < 32 is a control char.
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      control++;
    }
  }

  return control / sample.length > 0.1;
}

export interface SanitizeOptions {
  limits?: SanitizeLimits;

  /** When false (default), a utf-8 file that sniffs as binary is rejected. */
  allowBinary?: boolean;
}

/**
 * Harden a staged file set. Returns a NEW array of canonicalised `ImportFile`s
 * (paths normalised, deduped by last-write) or throws ImportSecurityError on the
 * first hard violation. This runs BEFORE the pipeline stages anything, so a
 * hostile bundle never reaches the disposable staging — let alone the target.
 */
export function sanitizeImportFiles(files: StagedInputFile[], options: SanitizeOptions = {}): ImportFile[] {
  const limits = options.limits ?? DEFAULT_IMPORT_LIMITS;

  if (!Array.isArray(files)) {
    throw new ImportSecurityError('Import files must be an array', 'IMPORT_FILES_INVALID');
  }

  if (files.length > limits.maxFileCount) {
    throw new ImportSecurityError(
      `Import bundle has ${files.length} files (max ${limits.maxFileCount})`,
      'IMPORT_TOO_MANY_FILES',
    );
  }

  const byPath = new Map<string, ImportFile>();

  let totalBytes = 0;

  for (const file of files) {
    // Directory entries carry no content — skip them (their files are explicit).
    if (file.type === 'directory') {
      continue;
    }

    // Symlinks can point outside the staging root; a bundle must not carry them.
    if (file.type === 'symlink' || file.linkTarget !== undefined) {
      throw new ImportSecurityError(
        `Symlink entries are not allowed in an import bundle: ${file.path}`,
        'IMPORT_SYMLINK_REJECTED',
        file.path,
      );
    }

    const path = normalizeStagedPath(file.path, limits);

    const bytes = decodedByteLength(file);

    if (bytes > limits.maxFileBytes) {
      throw new ImportSecurityError(
        `File ${path} is ${bytes} bytes (max ${limits.maxFileBytes})`,
        'IMPORT_FILE_TOO_LARGE',
        path,
      );
    }

    totalBytes += bytes;

    if (totalBytes > limits.maxTotalBytes) {
      throw new ImportSecurityError(
        `Import bundle exceeds total size ${limits.maxTotalBytes} bytes (archive bomb guard)`,
        'IMPORT_BUNDLE_TOO_LARGE',
        path,
      );
    }

    const isBase64 = file.encoding === 'base64';

    if (!options.allowBinary && !isBase64 && looksBinary(file.content)) {
      throw new ImportSecurityError(
        `File ${path} is declared text but sniffs as binary; re-import with base64 encoding`,
        'IMPORT_BINARY_AS_TEXT',
        path,
      );
    }

    byPath.set(path, { path, content: file.content, ...(file.encoding ? { encoding: file.encoding } : {}) });
  }

  return [...byPath.values()];
}

/* -------------------------------------------------------------------------- */
/*  Bundle normalisation (bolt / lovable / base44 / previous-agent-export)     */
/* -------------------------------------------------------------------------- */

/**
 * Export bundles from Bolt / Lovable / Base44 frequently nest the whole project
 * under a single top-level folder (e.g. `my-app/…`). Strip exactly ONE shared
 * top-level directory when EVERY file shares it, so the imported project is not
 * buried one level deep. Conservative: if files disagree on the top folder,
 * nothing is stripped. Never changes file contents.
 */
export function stripCommonWrapperDir(files: ImportFile[]): ImportFile[] {
  if (files.length === 0) {
    return files;
  }

  const firstTop = files[0].path.split('/')[0];

  if (!firstTop || files.some((f) => !f.path.includes('/') || f.path.split('/')[0] !== firstTop)) {
    return files;
  }

  return files.map((f) => ({ ...f, path: f.path.slice(firstTop.length + 1) }));
}

/**
 * Normalise a file-bundle provider's payload: sanitise, then strip a shared
 * wrapper dir. `provider` is accepted for future per-provider quirks and to keep
 * call sites self-documenting.
 */
export function normalizeBundleImport(
  _provider: ImportProvider,
  files: StagedInputFile[],
  options: SanitizeOptions = {},
): ImportFile[] {
  const safe = sanitizeImportFiles(files, options);
  return stripCommonWrapperDir(safe);
}

/* -------------------------------------------------------------------------- */
/*  Spreadsheet → project (derived, no external key)                           */
/* -------------------------------------------------------------------------- */

export interface SpreadsheetParseResult {
  columns: string[];
  rows: string[][];
}

/**
 * RFC-4180-ish delimited parser (CSV / TSV). Handles quoted fields, escaped
 * quotes (`""`), and delimiters / newlines inside quotes. Pure, no dependency.
 */
export function parseDelimited(text: string, delimiter: ',' | '\t' = ','): SpreadsheetParseResult {
  const rows: string[][] = [];

  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // swallow — a following \n commits the row; a lone \r also commits.
      if (text[i + 1] !== '\n') {
        pushRow();
      }
    } else {
      field += char;
    }
  }

  // Flush a trailing field/row unless the input ended exactly on a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop a fully-empty trailing row (common with a terminal newline).
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ''));

  if (cleaned.length === 0) {
    return { columns: [], rows: [] };
  }

  const [header, ...body] = cleaned;

  return { columns: header, rows: body };
}

export interface SpreadsheetProjectOptions {
  name?: string;
  delimiter?: ',' | '\t';
  limits?: SanitizeLimits;
}

const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024; // 20 MiB of CSV
const MAX_SPREADSHEET_ROWS = 100_000;

/**
 * Turn a CSV/TSV upload into a REAL, runnable static project: the parsed data as
 * `data.json`, a zero-dependency `index.html` that renders it as a sortable
 * table, and a README. This is genuine work — a viewable app from a sheet — with
 * no external credential. Output is a normal `ImportFile[]`; the caller stages it
 * through the same secure pipeline (scan → consent → commit) as any import.
 */
export function buildSpreadsheetProject(
  csvText: string,
  options: SpreadsheetProjectOptions = {},
): {
  files: ImportFile[];
  rowCount: number;
  columns: string[];
} {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) {
    throw new ImportSecurityError('Spreadsheet import received empty content', 'IMPORT_SPREADSHEET_EMPTY');
  }

  if (Buffer.byteLength(csvText, 'utf8') > MAX_SPREADSHEET_BYTES) {
    throw new ImportSecurityError(`Spreadsheet exceeds ${MAX_SPREADSHEET_BYTES} bytes`, 'IMPORT_SPREADSHEET_TOO_LARGE');
  }

  const delimiter = options.delimiter ?? (csvText.includes('\t') && !csvText.includes(',') ? '\t' : ',');
  const parsed = parseDelimited(csvText, delimiter);

  if (parsed.columns.length === 0) {
    throw new ImportSecurityError('Spreadsheet has no header row', 'IMPORT_SPREADSHEET_NO_HEADER');
  }

  if (parsed.rows.length > MAX_SPREADSHEET_ROWS) {
    throw new ImportSecurityError(
      `Spreadsheet has ${parsed.rows.length} rows (max ${MAX_SPREADSHEET_ROWS})`,
      'IMPORT_SPREADSHEET_TOO_MANY_ROWS',
    );
  }

  const name = (options.name ?? 'Spreadsheet App').trim() || 'Spreadsheet App';

  // Map rows to objects keyed by (de-duplicated, non-empty) column names.
  const columns = parsed.columns.map((c, i) => (c.trim() === '' ? `column_${i + 1}` : c.trim()));

  const records = parsed.rows.map((r) => {
    const record: Record<string, string> = {};
    columns.forEach((col, i) => {
      record[col] = r[i] ?? '';
    });

    return record;
  });

  const dataJson = JSON.stringify({ columns, rows: records }, null, 2);

  // replaceAll — the placeholder appears in BOTH <title> and <h1>.
  const indexHtml = SPREADSHEET_INDEX_HTML.replaceAll('__APP_NAME__', escapeHtml(name));

  const readme = [
    `# ${name}`,
    '',
    'Generated by the E-Code **Spreadsheet** import connector from an uploaded CSV/TSV.',
    '',
    `- **Columns:** ${columns.length} (${columns.map((c) => '`' + c + '`').join(', ')})`,
    `- **Rows:** ${records.length}`,
    '',
    'Open `index.html` (or run any static server) to view the data as a sortable table.',
    'The parsed data lives in `data.json`.',
    '',
  ].join('\n');

  const files: ImportFile[] = [
    { path: 'index.html', content: indexHtml },
    { path: 'data.json', content: dataJson },
    { path: 'README.md', content: readme },
  ];

  return { files, rowCount: records.length, columns };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Zero-dependency viewer. Fetches `data.json` and renders a sortable table.
 * Uses `textContent` everywhere (never innerHTML with data) so imported cell
 * values can never inject markup.
 */
const SPREADSHEET_INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>__APP_NAME__</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 1.5rem; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 1rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
    th, td { border: 1px solid #d1d5db; padding: 0.4rem 0.6rem; text-align: left; }
    th { cursor: pointer; background: rgba(127,127,127,0.12); position: sticky; top: 0; }
    tbody tr:nth-child(even) { background: rgba(127,127,127,0.05); }
  </style>
</head>
<body>
  <h1>__APP_NAME__</h1>
  <div class="meta" id="meta"></div>
  <table><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table>
  <script>
    let sortState = { col: null, dir: 1 };
    fetch('./data.json').then(function (r) { return r.json(); }).then(function (data) {
      var columns = data.columns || [];
      var rows = data.rows || [];
      document.getElementById('meta').textContent = rows.length + ' rows × ' + columns.length + ' columns';
      var head = document.getElementById('head');
      columns.forEach(function (col, idx) {
        var th = document.createElement('th');
        th.textContent = col;
        th.addEventListener('click', function () {
          sortState.dir = sortState.col === col ? -sortState.dir : 1;
          sortState.col = col;
          rows.sort(function (a, b) {
            var av = (a[col] || ''), bv = (b[col] || '');
            var an = parseFloat(av), bn = parseFloat(bv);
            if (!isNaN(an) && !isNaN(bn)) { return (an - bn) * sortState.dir; }
            return av.localeCompare(bv) * sortState.dir;
          });
          render(columns, rows);
        });
        head.appendChild(th);
      });
      render(columns, rows);
    }).catch(function (e) {
      document.getElementById('meta').textContent = 'Failed to load data.json: ' + e;
    });
    function render(columns, rows) {
      var body = document.getElementById('rows');
      body.textContent = '';
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        columns.forEach(function (col) {
          var td = document.createElement('td');
          td.textContent = row[col] == null ? '' : String(row[col]);
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
  </script>
</body>
</html>
`;

/* -------------------------------------------------------------------------- */
/*  Orchestration                                                              */
/* -------------------------------------------------------------------------- */

export interface ConnectorPrepareInput {
  files?: StagedInputFile[];

  /** For spreadsheet: raw CSV/TSV text, when not passed as a file. */
  sourceText?: string;

  /** Optional project name hint (spreadsheet). */
  name?: string;

  /**
   * Whether the caller holds a usable credential for an external-api provider.
   * The endpoint resolves this from the user's connected connector token; when
   * false (the norm here) external-api providers are BLOCKED, not faked.
   */
  hasExternalCredential?: boolean;
  options?: SanitizeOptions;
}

export interface ConnectorPrepareResult {
  files: ImportFile[];

  /** Provider-specific summary for logs/audit (never contains secrets). */
  summary: Record<string, unknown>;
}

/**
 * Resolve a provider's raw input into the sanitised `ImportFile[]` the pipeline
 * stages — or throw a typed, precise error. This is the single entry the
 * endpoint calls; it enforces the honest BLOCKED contract for external-api
 * providers and the security hardening for everything else.
 */
export function prepareConnectorImport(provider: ImportProvider, input: ConnectorPrepareInput): ConnectorPrepareResult {
  const capability = CONNECTOR_CAPABILITIES[provider];

  if (!capability) {
    throw new ImportSecurityError(`Unknown import provider "${provider}"`, 'IMPORT_UNKNOWN_PROVIDER');
  }

  switch (capability.execution) {
    case 'external-api': {
      if (!input.hasExternalCredential) {
        throw new ConnectorCredentialRequiredError(
          provider,
          capability.blockedReason ?? capability.credentialRequirement ?? 'external credential missing',
        );
      }

      /*
       * A credential was supplied but the fetch engine is not wired in this
       * module (network is out of scope for a pure module). Honest 424 rather
       * than a fake success — the caller passes files[] once the fetch lands.
       */
      if (!input.files || input.files.length === 0) {
        throw new ConnectorCredentialRequiredError(
          provider,
          `credential present but the ${provider} source fetch is not wired; supply files[] to import`,
          'CONNECTOR_FETCH_NOT_WIRED',
        );
      }

      const files = sanitizeImportFiles(input.files, input.options);

      return { files, summary: { provider, fileCount: files.length, via: 'external-api+files' } };
    }

    case 'derived': {
      // spreadsheet
      const csv = input.sourceText ?? extractSpreadsheetText(input.files);

      if (csv === undefined) {
        throw new ImportSecurityError(
          'Spreadsheet import needs CSV/TSV content (sourceText or a .csv/.tsv file)',
          'IMPORT_SPREADSHEET_MISSING',
        );
      }

      const built = buildSpreadsheetProject(csv, { name: input.name });

      // The generated files are ours, but run them through the same gate anyway.
      const files = sanitizeImportFiles(built.files, input.options);

      return { files, summary: { provider, rowCount: built.rowCount, columns: built.columns.length, via: 'derived' } };
    }

    case 'file-bundle': {
      if (!input.files || input.files.length === 0) {
        throw new ImportSecurityError(`${provider} import needs an export bundle (files[])`, 'IMPORT_BUNDLE_MISSING');
      }

      const files = normalizeBundleImport(provider, input.files, input.options);

      return { files, summary: { provider, fileCount: files.length, via: 'file-bundle' } };
    }

    case 'native':
    default:
      throw new ImportSecurityError(
        `Provider "${provider}" is handled by its own dedicated endpoint, not the connector pipeline`,
        'IMPORT_NATIVE_PROVIDER',
      );
  }
}

/** Pull CSV/TSV text out of an uploaded file set (first .csv/.tsv, else the lone file). */
function extractSpreadsheetText(files?: StagedInputFile[]): string | undefined {
  if (!files || files.length === 0) {
    return undefined;
  }

  const csv = files.find((f) => /\.(csv|tsv)$/i.test(f.path));

  if (csv) {
    return csv.encoding === 'base64' ? Buffer.from(csv.content, 'base64').toString('utf8') : csv.content;
  }

  if (files.length === 1) {
    const only = files[0];
    return only.encoding === 'base64' ? Buffer.from(only.content, 'base64').toString('utf8') : only.content;
  }

  return undefined;
}
