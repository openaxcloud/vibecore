/**
 * Pre-write AST validator + Prettier formatter for streamed file actions
 * (Phase 0 #2 — AST self-repair pipeline).
 *
 * Contract:
 *   - Caller hands us the proposed file content + language hint.
 *   - We parse with `@babel/parser` (TS/TSX/JS/JSX) and run Prettier on
 *     success.
 *   - On parse error we return a structured failure with the parser's
 *     message + offset so the LLM round-trip can quote it back to the
 *     model in the self-repair prompt.
 *
 * Non-JS languages return `kind: 'skipped'` so the caller knows to
 * write the content as-is (Prettier still ships parsers for json/css/
 * markdown — we lazy-load them when present).
 *
 * No streaming, no side effects, no LLM call. The retry-with-LLM
 * pipeline lives one level up and chains validate → repair → validate
 * with a budget of two attempts.
 */

import { parse as babelParse, type ParserPlugin } from '@babel/parser';

export type HunkLanguage =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'json'
  | 'jsonc'
  | 'css'
  | 'scss'
  | 'html'
  | 'markdown'
  | 'unknown';

export interface HunkValidationOk {
  kind: 'ok';

  /** Prettier-formatted content; falls back to the input when formatting is unavailable. */
  formatted: string;
  language: HunkLanguage;
}

export interface HunkValidationError {
  kind: 'error';
  message: string;

  /** Best-effort line / column of the failure. */
  line?: number;
  column?: number;
  language: HunkLanguage;
}

export interface HunkValidationSkipped {
  kind: 'skipped';
  language: HunkLanguage;
}

export type HunkValidationResult = HunkValidationOk | HunkValidationError | HunkValidationSkipped;

const EXT_TO_LANGUAGE: Record<string, HunkLanguage> = {
  js: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  tsx: 'tsx',
  json: 'json',

  /*
   * .jsonc / .json5 legitimately allow comments + trailing commas, which
   * strict JSON.parse rejects. Treat them as their own language so we skip
   * the strict parse (and never trigger a needless self-repair round-trip
   * that would strip the comments) — mirrors isJsonLikePath() in
   * app/utils/sanitize-file-content.ts which excludes them too.
   */
  jsonc: 'jsonc',
  json5: 'jsonc',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
};

export function detectHunkLanguage(filePath: string): HunkLanguage {
  const dotIdx = filePath.lastIndexOf('.');

  if (dotIdx === -1 || dotIdx === filePath.length - 1) {
    return 'unknown';
  }

  const ext = filePath.slice(dotIdx + 1).toLowerCase();

  return EXT_TO_LANGUAGE[ext] ?? 'unknown';
}

function babelPluginsFor(language: HunkLanguage): ParserPlugin[] {
  const plugins: ParserPlugin[] = ['classProperties', 'classPrivateProperties', 'classPrivateMethods'];

  switch (language) {
    case 'typescript':
      plugins.push('typescript');
      break;
    case 'tsx':
      plugins.push('typescript', 'jsx');
      break;
    case 'jsx':
      plugins.push('jsx');
      break;
    default:
      break;
  }

  return plugins;
}

function parseError(error: unknown, language: HunkLanguage): HunkValidationError {
  const err = error as { message?: string; loc?: { line?: number; column?: number } };

  return {
    kind: 'error',
    message: err.message ?? 'Failed to parse hunk',
    line: err.loc?.line,
    column: err.loc?.column,
    language,
  };
}

type PrettierModule = {
  format: (source: string, options: Record<string, unknown>) => Promise<string> | string;
};

let cachedPrettier: PrettierModule | null | undefined;

async function loadPrettier(): Promise<PrettierModule | null> {
  if (cachedPrettier !== undefined) {
    return cachedPrettier;
  }

  try {
    const mod = (await import('prettier')) as unknown as PrettierModule;
    cachedPrettier = mod;

    return mod;
  } catch {
    cachedPrettier = null;
    return null;
  }
}

function prettierParserFor(language: HunkLanguage): string | undefined {
  switch (language) {
    case 'javascript':
      return 'babel';
    case 'jsx':
      return 'babel';
    case 'typescript':
      return 'typescript';
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'jsonc':
      return 'jsonc';
    case 'css':
      return 'css';
    case 'scss':
      return 'scss';
    case 'html':
      return 'html';
    case 'markdown':
      return 'markdown';
    default:
      return undefined;
  }
}

async function formatWithPrettier(source: string, language: HunkLanguage): Promise<string> {
  const parser = prettierParserFor(language);

  if (!parser) {
    return source;
  }

  const prettier = await loadPrettier();

  if (!prettier) {
    return source;
  }

  try {
    const result = await prettier.format(source, { parser });
    return typeof result === 'string' ? result : source;
  } catch {
    return source;
  }
}

/**
 * Validate (and optionally format) a hunk before writing it to disk.
 *
 * @param filePath Used to detect the language from the extension.
 * @param source Proposed file content.
 * @param options.format When true (the default) the result is run through
 *        Prettier; pass `false` for hot paths that just need a parse check.
 */
export async function validateAndFormatHunk(
  filePath: string,
  source: string,
  options: { format?: boolean } = {},
): Promise<HunkValidationResult> {
  const language = detectHunkLanguage(filePath);

  if (language === 'javascript' || language === 'jsx' || language === 'typescript' || language === 'tsx') {
    try {
      babelParse(source, {
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        plugins: babelPluginsFor(language),
      });
    } catch (error) {
      return parseError(error, language);
    }
  } else if (language === 'json') {
    try {
      JSON.parse(source);
    } catch (error) {
      return parseError(error, language);
    }
  } else if (language === 'unknown') {
    return { kind: 'skipped', language };
  }

  const formatted = options.format === false ? source : await formatWithPrettier(source, language);

  return { kind: 'ok', formatted, language };
}

/**
 * Build the user-facing follow-up message the LLM should see when a
 * hunk fails validation. The agent quotes the failing source + error
 * back to the model so it can self-repair.
 */
export function buildSelfRepairPrompt(filePath: string, source: string, validation: HunkValidationError): string {
  const locationHint =
    validation.line !== undefined
      ? ` at line ${validation.line}${validation.column !== undefined ? `, column ${validation.column}` : ''}`
      : '';

  return [
    `The previous file action for \`${filePath}\` failed to parse${locationHint}:`,
    '',
    '```',
    validation.message,
    '```',
    '',
    'Re-emit the full file content for the action. Fix the parse error;',
    'do not omit any lines. Keep the same path. Output only the corrected',
    'file as a single boltAction.',
    '',
    'Current proposed content:',
    '```',
    source,
    '```',
  ].join('\n');
}

/**
 * Tests-only hook to flush the cached Prettier module between cases.
 */
export function resetPrettierCacheForTest(): void {
  cachedPrettier = undefined;
}
