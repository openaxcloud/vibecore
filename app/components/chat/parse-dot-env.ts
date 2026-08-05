/*
 * Pure .env-block parser for the Secrets panel bulk import (E22).
 *
 * Accepts a pasted .env blob and returns the KEY=value entries plus an honest
 * list of the lines it could NOT parse (so the UI never silently drops user
 * input). Handles `export KEY=value`, single/double-quoted values, comments
 * (# …), blank lines and CRLF; trims whitespace; a key repeated later in the
 * paste wins (standard .env semantics) without producing duplicate entries.
 */

export interface DotEnvEntry {
  key: string;
  value: string;
}

export interface DotEnvSkippedLine {
  /** 1-based line number in the pasted text. */
  line: number;

  /** The offending line, truncated for display (may contain a secret — mask-aware callers only). */
  text: string;

  reason: 'no-equals-sign' | 'invalid-key';
}

export interface DotEnvParseResult {
  entries: DotEnvEntry[];
  skipped: DotEnvSkippedLine[];
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SKIPPED_TEXT_MAX_LENGTH = 80;

function truncateForDisplay(line: string): string {
  return line.length > SKIPPED_TEXT_MAX_LENGTH ? `${line.slice(0, SKIPPED_TEXT_MAX_LENGTH)}…` : line;
}

export function parseDotEnv(text: string): DotEnvParseResult {
  const entries: DotEnvEntry[] = [];
  const entryIndexByKey = new Map<string, number>();
  const skipped: DotEnvSkippedLine[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    // Blank lines and comments are legitimate .env content — skip silently.
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');

    if (eq <= 0) {
      skipped.push({ line: index + 1, text: truncateForDisplay(line), reason: 'no-equals-sign' });
      continue;
    }

    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');

    if (!ENV_KEY_PATTERN.test(key)) {
      skipped.push({ line: index + 1, text: truncateForDisplay(line), reason: 'invalid-key' });
      continue;
    }

    let value = line.slice(eq + 1).trim();

    // Strip one matching pair of surrounding quotes ("…" or '…') only.
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    const existingIndex = entryIndexByKey.get(key);

    if (existingIndex !== undefined) {
      // Last occurrence wins; keep a single preview row per key.
      entries[existingIndex] = { key, value };
    } else {
      entryIndexByKey.set(key, entries.length);
      entries.push({ key, value });
    }
  }

  return { entries, skipped };
}

/** Human label for a skip reason (kept here so the panel and tests agree). */
const SKIP_REASON_COPY = {
  en: {
    'no-equals-sign': 'missing "=" separator',
    'invalid-key': 'invalid key name',
  },
  fr: {
    'no-equals-sign': 'séparateur « = » manquant',
    'invalid-key': 'nom de clé invalide',
  },
} as const;

export function describeSkipReason(reason: DotEnvSkippedLine['reason'], language?: string | null): string {
  const copy = language?.toLowerCase().startsWith('fr') ? SKIP_REASON_COPY.fr : SKIP_REASON_COPY.en;

  return copy[reason];
}
