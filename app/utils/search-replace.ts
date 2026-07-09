/**
 * Anchored search/replace ("diff-edit") core — INCREMENT 1 of 5.
 *
 * Pure, side-effect-free module: no fs, no runtime, no React, no network,
 * no Date.now / Math.random. Given a block of Aider-style anchored
 * search/replace text it parses the blocks and applies them to a source
 * string with an exact-first, fuzzy-fallback matcher and a STRICT
 * all-or-nothing fail-safe (a partially applied buffer is never returned).
 *
 * The format (no line numbers) is:
 *
 *     <<<<<<< SEARCH
 *     <exact contiguous anchor lines to find>
 *     =======
 *     <replacement lines>
 *     >>>>>>> REPLACE
 *
 * A payload may contain one or more such blocks, applied in order.
 *
 * This increment is standalone: nothing here is wired into the
 * message-parser / action-runner / prompts (increments 2-5).
 */

/*
 * ---------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------------
 */

export interface SearchReplaceBlock {
  search: string;
  replace: string;
}

export interface ParseResult {
  blocks: SearchReplaceBlock[];
  malformed: boolean;
  error?: string;
}

export type HunkStatus = 'applied-exact' | 'applied-fuzzy' | 'failed-not-found' | 'failed-ambiguous';

export interface HunkResult {
  block: SearchReplaceBlock;
  status: HunkStatus;
  index: number;
}

export interface ApplyResult {
  ok: boolean;
  content: string | null;
  hunks: HunkResult[];
}

/*
 * ---------------------------------------------------------------------------
 * Configuration constant
 * ---------------------------------------------------------------------------
 */

/**
 * Reads an env bag defensively. In client bundles Vite shims `process.env`
 * to `{}` (see MEMORY: "SSR process.env empty"), and `process` may be
 * undefined entirely; either way we fall back to the default. Never throws.
 */
function readProcessEnv(): Record<string, string | undefined> {
  try {
    if (typeof process !== 'undefined' && process && process.env) {
      return process.env as Record<string, string | undefined>;
    }
  } catch {
    // process not defined in this environment — fall through
  }

  return {};
}

/**
 * Resolves the hybrid diff-edit threshold. Existing files with MORE than this
 * many lines are candidates for anchored diff edits; smaller files prefer
 * full-file rewrites. Env-overridable via `DIFF_EDIT_MIN_LINES`; invalid /
 * non-positive / non-finite overrides are ignored and the default (500) wins.
 *
 * Increment 1 exposes this as a pure constant — no logic consumes it yet.
 */
export function resolveDiffMinLines(env: Record<string, string | undefined> = readProcessEnv()): number {
  const raw = env.DIFF_EDIT_MIN_LINES;

  if (raw == null || raw === '') {
    return 500;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 500;
  }

  return parsed;
}

/** Hybrid threshold constant (default 500, env-overridable at module load). */
export const DIFF_EDIT_MIN_LINES = resolveDiffMinLines();

/*
 * ---------------------------------------------------------------------------
 * Observability helper
 * ---------------------------------------------------------------------------
 */

export interface DiffTokenSaving {
  /** Approx output tokens a full-file rewrite would have cost. */
  fullFileTokens: number;

  /** Approx output tokens the diff payload actually cost. */
  diffTokens: number;

  /** `fullFileTokens - diffTokens`, floored at 0. */
  savedTokens: number;
}

/**
 * Rough OUTPUT-token saving of a diff edit vs. re-emitting the whole file,
 * using the common ~4-chars-per-token heuristic. `fullContent` is the file the
 * model would otherwise have written in full (the applied result); `diffPayload`
 * is the raw search/replace text it emitted instead. Pure and never negative —
 * used only for best-effort telemetry, never to gate the apply path.
 */
export function estimateDiffTokenSaving(fullContent: string, diffPayload: string): DiffTokenSaving {
  const fullFileTokens = Math.ceil(fullContent.length / 4);
  const diffTokens = Math.ceil(diffPayload.length / 4);

  return { fullFileTokens, diffTokens, savedTokens: Math.max(0, fullFileTokens - diffTokens) };
}

/*
 * ---------------------------------------------------------------------------
 * Parser
 * ---------------------------------------------------------------------------
 */

/**
 * A marker line is exactly the 7 marker chars, optionally followed by
 * whitespace and trailing text (Aider writes `<<<<<<< SEARCH`). We anchor to
 * the START of the line so a `=======` that merely appears mid-line inside
 * code is not treated as a divider.
 */
function isSearchMarker(line: string): boolean {
  return /^<{7}(?:\s.*)?$/.test(line);
}

function isDividerMarker(line: string): boolean {
  return /^={7}(?:\s.*)?$/.test(line);
}

function isReplaceMarker(line: string): boolean {
  return /^>{7}(?:\s.*)?$/.test(line);
}

/**
 * Split into lines while remembering the original line terminators so the
 * body can be reconstructed byte-for-byte. We normalize CRLF/CR to LF for the
 * emitted body (deterministic) but never trim body content.
 */
function splitLines(content: string): string[] {
  /*
   * Normalize CRLF and lone CR to LF, then split. Splitting on '\n' keeps a
   * trailing empty element when the content ends in a newline, which we use
   * to faithfully rebuild trailing-newline semantics.
   */
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * Parse ALL blocks in order.
 *
 * State machine over lines. Only a `=======` divider seen while a SEARCH is
 * open (and before its REPLACE) is treated as the divider — so `=======`
 * lines inside replacement code are preserved verbatim.
 *
 * On malformed input we return any cleanly parsed LEADING blocks and set
 * `malformed: true` with a human-readable `error`, so the caller can choose a
 * fallback while still knowing what parsed.
 */
export function parseSearchReplaceBlocks(content: string): ParseResult {
  const blocks: SearchReplaceBlock[] = [];

  if (content === '') {
    return { blocks, malformed: false };
  }

  const lines = splitLines(content);

  // Parser states.
  type State = 'idle' | 'in-search' | 'in-replace';

  let state: State = 'idle';

  let searchLines: string[] = [];
  let replaceLines: string[] = [];

  const fail = (error: string): ParseResult => ({ blocks, malformed: true, error });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (state === 'idle') {
      if (isSearchMarker(line)) {
        state = 'in-search';
        searchLines = [];
        replaceLines = [];
        continue;
      }

      if (isDividerMarker(line)) {
        return fail(`Divider '=======' at line ${i + 1} with no open SEARCH block`);
      }

      if (isReplaceMarker(line)) {
        return fail(`'>>>>>>> REPLACE' at line ${i + 1} with no open SEARCH block`);
      }

      // Any other line outside a block is ignored (prose/framing around the blocks).
      continue;
    }

    if (state === 'in-search') {
      if (isSearchMarker(line)) {
        return fail(`Nested '<<<<<<< SEARCH' at line ${i + 1} before divider`);
      }

      if (isDividerMarker(line)) {
        state = 'in-replace';
        continue;
      }

      if (isReplaceMarker(line)) {
        return fail(`'>>>>>>> REPLACE' at line ${i + 1} before divider '======='`);
      }

      searchLines.push(line);
      continue;
    }

    // state === 'in-replace'
    if (isReplaceMarker(line)) {
      blocks.push({
        search: searchLines.join('\n'),
        replace: replaceLines.join('\n'),
      });
      state = 'idle';
      continue;
    }

    if (isSearchMarker(line)) {
      return fail(`Nested '<<<<<<< SEARCH' at line ${i + 1} before '>>>>>>> REPLACE'`);
    }

    // A `=======` inside replacement code is NOT a divider here — keep it.
    replaceLines.push(line);
  }

  if (state === 'in-search') {
    return fail("Unterminated SEARCH block: missing divider '======='");
  }

  if (state === 'in-replace') {
    return fail("Unterminated block: missing '>>>>>>> REPLACE'");
  }

  return { blocks, malformed: false };
}

/*
 * ---------------------------------------------------------------------------
 * Applier
 * ---------------------------------------------------------------------------
 */

/**
 * Count non-overlapping occurrences of `needle` in `haystack`. Returns early
 * once the count exceeds 1 (we only need to distinguish 0 / 1 / many).
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') {
    return 0;
  }

  let count = 0;
  let from = 0;

  while (true) {
    const idx = haystack.indexOf(needle, from);

    if (idx === -1) {
      break;
    }

    count++;

    if (count > 1) {
      return count;
    }

    from = idx + needle.length;
  }

  return count;
}

/** Normalize a line for fuzzy comparison: strip leading/trailing whitespace. */
function normalizeLine(line: string): string {
  return line.trim();
}

interface FuzzyMatch {
  start: number; // inclusive line index in fileLines
  end: number; // exclusive line index in fileLines
}

/**
 * Fuzzy line-based matcher. Compares the search block against every candidate
 * contiguous window of the file, ignoring per-line leading/trailing whitespace
 * (which also absorbs uniform indentation shifts and trailing-whitespace
 * drift). Returns all windows that match under this normalization.
 *
 * Blank search lines match blank file lines (both normalize to '').
 */
function findFuzzyMatches(fileLines: string[], searchLines: string[]): FuzzyMatch[] {
  const matches: FuzzyMatch[] = [];
  const window = searchLines.length;

  if (window === 0 || window > fileLines.length) {
    return matches;
  }

  const normSearch = searchLines.map(normalizeLine);

  for (let start = 0; start + window <= fileLines.length; start++) {
    let ok = true;

    for (let j = 0; j < window; j++) {
      if (normalizeLine(fileLines[start + j]) !== normSearch[j]) {
        ok = false;
        break;
      }
    }

    if (ok) {
      matches.push({ start, end: start + window });
    }
  }

  return matches;
}

/**
 * Determine the common leading-whitespace prefix shared by all non-blank
 * lines of a block. Used to detect and correct uniform indentation shifts.
 */
function commonIndent(lines: string[]): string {
  let indent: string | null = null;

  for (const line of lines) {
    if (line.trim() === '') {
      continue; // blank lines don't constrain indentation
    }

    const lead = line.slice(0, line.length - line.trimStart().length);

    if (indent === null) {
      indent = lead;
      continue;
    }

    // Longest common prefix of the two indents.
    let k = 0;

    const max = Math.min(indent.length, lead.length);

    while (k < max && indent[k] === lead[k]) {
      k++;
    }

    indent = indent.slice(0, k);
  }

  return indent ?? '';
}

/**
 * Re-indent the replacement to live where the matched block lived.
 *
 * The search block may have been written at a different indentation than the
 * file's actual code (a "uniform indentation shift"). We compute the delta
 * between the file block's common indent and the search block's common indent
 * and apply that same delta to every non-blank replacement line — so the
 * replacement lands at the file's indentation level while preserving relative
 * nesting inside the replacement. Blank lines stay blank.
 */
function reindentReplacement(replaceLines: string[], matchedFileLines: string[], searchLines: string[]): string[] {
  const fileIndent = commonIndent(matchedFileLines);
  const searchIndent = commonIndent(searchLines);

  if (fileIndent === searchIndent) {
    return replaceLines;
  }

  return replaceLines.map((line) => {
    if (line.trim() === '') {
      return line;
    }

    /*
     * Strip the search-block's common indent (if present) then prepend the
     * file-block's common indent, preserving any extra relative indentation.
     */
    let body = line;

    if (searchIndent === '' || body.startsWith(searchIndent)) {
      /*
       * Strip the search block's common indent (possibly empty), keeping this
       * line's OWN relative indentation, then re-anchor under fileIndent.
       */
      body = body.slice(searchIndent.length);
    } else {
      /*
       * Search indent expected but not present on this line — strip whatever
       * leading whitespace it has and re-anchor to the file block indent.
       */
      body = body.trimStart();
    }

    return fileIndent + body;
  });
}

/**
 * Apply a single block to `content`. Returns the new content and the status,
 * or a failure status with the content unchanged (caller enforces the
 * all-or-nothing contract at the batch level).
 */
function applyOne(content: string, block: SearchReplaceBlock): { status: HunkStatus; content: string } {
  const { search, replace } = block;

  /*
   * Empty search — pure insertion request. We REJECT as ambiguous for safety:
   * an anchorless insertion has no deterministic, unambiguous target position.
   * (Documented rule — see module/report notes.)
   */
  if (search === '') {
    return { status: 'failed-ambiguous', content };
  }

  /*
   * No-op: search === replace. Treat as an exact (single) match applied with
   * no change to the buffer. If it appears more than once it's still a no-op,
   * but we honor ambiguity semantics only when a real edit would occur; since
   * replacing X with X changes nothing regardless of count, report exact.
   */
  if (search === replace) {
    // Still require the anchor to exist so a stale no-op anchor surfaces.
    if (content.indexOf(search) !== -1) {
      return { status: 'applied-exact', content };
    }

    // Fall through to fuzzy existence check below (rare), else not-found.
  }

  // --- Exact matching ---
  const occurrences = countOccurrences(content, search);

  if (occurrences === 1) {
    const idx = content.indexOf(search);
    const next = content.slice(0, idx) + replace + content.slice(idx + search.length);

    return { status: 'applied-exact', content: next };
  }

  if (occurrences > 1) {
    // Multiple exact matches — never guess.
    return { status: 'failed-ambiguous', content };
  }

  // --- Fuzzy matching (only when zero exact matches) ---
  const fileLines = splitLines(content);
  const searchLines = splitLines(search);
  const replaceLines = splitLines(replace);

  const fuzzy = findFuzzyMatches(fileLines, searchLines);

  if (fuzzy.length === 0) {
    return { status: 'failed-not-found', content };
  }

  if (fuzzy.length > 1) {
    return { status: 'failed-ambiguous', content };
  }

  const { start, end } = fuzzy[0];
  const matchedFileLines = fileLines.slice(start, end);

  /*
   * No-op edge under fuzzy: search===replace but no exact substring hit (e.g.
   * whitespace-only difference). Report exact-style no-op, content unchanged.
   */
  if (search === replace) {
    return { status: 'applied-exact', content };
  }

  const reindented = reindentReplacement(replaceLines, matchedFileLines, searchLines);

  const nextLines = [...fileLines.slice(0, start), ...reindented, ...fileLines.slice(end)];

  return { status: 'applied-fuzzy', content: nextLines.join('\n') };
}

/**
 * Apply blocks IN ORDER, each to the running content produced by the prior
 * blocks. STRICT fail-safe: returns `ok: true` + the new full content ONLY
 * when EVERY block applied (exact or fuzzy). If ANY block fails, returns
 * `ok: false` and `content: null` — never a partially applied buffer — while
 * still reporting per-block statuses so the caller knows exactly which anchor
 * failed.
 *
 * On failure we STOP applying further blocks (later blocks may target text a
 * failed earlier block would have produced) but continue to record the
 * remaining blocks with a not-found status so `hunks[]` is complete and 1:1
 * with the input.
 */
export function applySearchReplace(original: string, blocks: SearchReplaceBlock[]): ApplyResult {
  const hunks: HunkResult[] = [];

  let running = original;
  let failed = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (failed) {
      // Already failed — don't apply, just record a status for completeness.
      hunks.push({ block, status: 'failed-not-found', index: i });
      continue;
    }

    const { status, content } = applyOne(running, block);

    hunks.push({ block, status, index: i });

    if (status === 'failed-not-found' || status === 'failed-ambiguous') {
      failed = true;
      continue;
    }

    running = content;
  }

  if (failed) {
    return { ok: false, content: null, hunks };
  }

  return { ok: true, content: running, hunks };
}
