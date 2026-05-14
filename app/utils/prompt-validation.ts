/**
 * Client-and-server-shared validation, normalization and best-effort prompt
 * hygiene for the /projects/new form. Two goals:
 *
 *  1. Stop runaway cost / abuse: a 10 MB paste should not reach the LLM.
 *  2. Keep what we forward to the model clean: NFC-normalized, control
 *     characters stripped, trimmed, blank-line runs collapsed.
 *
 * Hard scope boundaries:
 *
 *  - Prompt-injection detection here is *advisory*. It surfaces well-known
 *    bypass patterns as warnings so power users notice them, but the real
 *    defence is server-side: the backend must always treat user prompts as
 *    data, never as instructions. False positives are common (a legit copy
 *    deck can literally say "ignore previous suggestions"), so blocking
 *    would be worse than warning.
 *
 *  - Content moderation (illegal/abusive content) is NOT covered. That
 *    requires an external moderation call and lives outside this helper.
 *
 * Every export is pure so the same code can run in the React form on the
 * client and in the Remix action on the server.
 */

/** Soft minimum the existing UI already enforced: refuse one-word prompts. */
export const PROMPT_MIN_WORDS = 3;

/**
 * Hard maximum character count. Anthropic / OpenAI charge per token; an 8 000
 * character prompt is already ~2 000 tokens, well above any reasonable
 * project-description length while still leaving room for thoughtful detail.
 */
export const PROMPT_MAX_CHARS = 8_000;

/** Refuse pasted logs / dumps that produce hundreds of newlines. */
export const PROMPT_MAX_LINES = 200;

/**
 * Well-known prompt-injection bypass markers. Surfaced as warnings, not
 * blockers. Add new patterns here when you spot abuse in the wild — keep the
 * list tight so legitimate prose isn't flagged.
 */
export const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:the\s+)?previous\s+(?:instructions?|messages?|context|prompts?)\b/i,
  /\bdisregard\s+(?:all\s+|the\s+)*(?:above|previous|prior)\b/i,
  /\bforget\s+(?:all\s+|the\s+)*(?:previous|prior|above)\b/i,
  /^\s*(?:system|assistant|developer)\s*:/im,
  /<\|(?:im_start|im_end|system|assistant|user)\|>/i,
  /\[INST\]|\[\/INST\]/,
  /<\/?(?:system|assistant)>/i,
  /\bjailbreak\b/i,
  /\bDAN\s+mode\b/i,
];

export type PromptValidationErrorCode = 'empty' | 'too_short' | 'too_long' | 'too_many_lines';

export type PromptValidationWarningCode = 'injection_pattern' | 'non_printable_stripped';

export interface PromptValidationIssue<Code extends string> {
  code: Code;
  message: string;
}

export interface PromptValidationResult {
  /**
   * The normalized form ready to send to the LLM. Always returned, even on
   * error, so callers can use it for displaying what would have been
   * forwarded if they want.
   */
  value: string;
  errors: PromptValidationIssue<PromptValidationErrorCode>[];
  warnings: PromptValidationIssue<PromptValidationWarningCode>[];
  characterCount: number;
  wordCount: number;
  lineCount: number;
}

export interface ValidateProjectPromptOptions {
  /** Override PROMPT_MIN_WORDS for the call site. */
  minWords?: number;

  /** Override PROMPT_MAX_CHARS for the call site. */
  maxChars?: number;

  /** Override PROMPT_MAX_LINES for the call site. */
  maxLines?: number;

  /** When true, an empty prompt is allowed (the form supports blank → empty project). */
  allowEmpty?: boolean;
}

/**
 * Pure string transform: NFC-normalize, strip control characters except
 * tab + newline, collapse 3+ blank lines into 2, trim. Idempotent.
 *
 * Why NFC specifically: Unicode normalization picks a single canonical form
 * for combining characters so two visually-identical inputs (`café` typed two
 * ways) compare equal and tokenize identically downstream.
 */
export function normalizeProjectPrompt(raw: string | null | undefined): string {
  if (!raw) {
    return '';
  }

  let value = raw;

  if (typeof value.normalize === 'function') {
    value = value.normalize('NFC');
  }

  /*
   * CRLF and lone CR → LF FIRST so the next pass (which strips other CRs as
   * control characters) doesn't eat real line breaks.
   */
  value = value.replace(/\r\n?/g, '\n');

  // Strip C0/C1 control chars except \t (0x09) and \n (0x0A).

  value = value.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, '');

  /*
   * Zero-width / direction-override smuggling: U+200B..U+200F (ZW*, LRM,
   * RLM), U+202A..U+202E (LRE..RLO), U+2060 (word joiner), U+FEFF (BOM).
   */
  value = value.replace(new RegExp('[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]', 'g'), '');

  // Collapse runs of 3 or more newlines into exactly two (one blank line).
  value = value.replace(/\n{3,}/g, '\n\n');

  /*
   * Collapse runs of inline whitespace (spaces / tabs) to a single space,
   * line by line, so the editor can't slip 4 000 spaces past the char cap.
   */
  value = value
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, ''))
    .join('\n');

  return value.trim();
}

/**
 * Best-effort prompt-injection sniff. Returns matching patterns so callers
 * can show a single, specific warning instead of a generic one.
 */
export function detectPromptInjection(value: string): RegExp[] {
  if (!value) {
    return [];
  }

  return PROMPT_INJECTION_PATTERNS.filter((pattern) => pattern.test(value));
}

function countWords(value: string): number {
  const trimmed = value.trim();

  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }

  return value.split('\n').length;
}

export function validateProjectPrompt(
  raw: string | null | undefined,
  options: ValidateProjectPromptOptions = {},
): PromptValidationResult {
  const minWords = options.minWords ?? PROMPT_MIN_WORDS;
  const maxChars = options.maxChars ?? PROMPT_MAX_CHARS;
  const maxLines = options.maxLines ?? PROMPT_MAX_LINES;

  const original = raw ?? '';
  const value = normalizeProjectPrompt(original);

  const errors: PromptValidationIssue<PromptValidationErrorCode>[] = [];
  const warnings: PromptValidationIssue<PromptValidationWarningCode>[] = [];

  const characterCount = value.length;
  const wordCount = countWords(value);
  const lineCount = countLines(value);

  if (!value) {
    if (!options.allowEmpty) {
      errors.push({ code: 'empty', message: 'Describe the project you want to create.' });
    }

    return { value, errors, warnings, characterCount, wordCount, lineCount };
  }

  if (wordCount < minWords) {
    errors.push({
      code: 'too_short',
      message: `Add a bit more detail — at least ${minWords} words help the agent build the right thing.`,
    });
  }

  if (characterCount > maxChars) {
    errors.push({
      code: 'too_long',
      message: `Trim your prompt — keep it under ${maxChars.toLocaleString()} characters (you have ${characterCount.toLocaleString()}).`,
    });
  }

  if (lineCount > maxLines) {
    errors.push({
      code: 'too_many_lines',
      message: `Too many lines (${lineCount}). Keep the brief under ${maxLines} lines; paste long docs into the project instead.`,
    });
  }

  if (original.length > value.length) {
    warnings.push({
      code: 'non_printable_stripped',
      message: 'Removed invisible / control characters from your prompt.',
    });
  }

  const injectionMatches = detectPromptInjection(value);

  if (injectionMatches.length > 0) {
    warnings.push({
      code: 'injection_pattern',
      message:
        "Your prompt contains phrases agents use to bypass safety — if that's intentional, fine; otherwise rephrase.",
    });
  }

  return { value, errors, warnings, characterCount, wordCount, lineCount };
}
