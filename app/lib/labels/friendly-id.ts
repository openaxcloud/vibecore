/*
 * Detect opaque identifiers (cuid / uuid / nanoid-like) so we can surface a
 * human-readable fallback in chrome (breadcrumbs, menus, share dialogs)
 * instead of leaking a 25-char string. Tooltip / aria-label keep the full
 * value so power-users can still copy it.
 */

const CUID_PATTERN = /^c[a-z0-9]{24}$/i;
const CUID2_PATTERN = /^[a-z][a-z0-9]{23}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NANOID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function looksLikeOpaqueId(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (CUID_PATTERN.test(trimmed)) {
    return true;
  }

  if (UUID_PATTERN.test(trimmed)) {
    return true;
  }

  if (CUID2_PATTERN.test(trimmed) && !/\s/.test(trimmed) && !/[A-Z][a-z]/.test(trimmed)) {
    return true;
  }

  if (NANOID_PATTERN.test(trimmed) && !/\s/.test(trimmed)) {
    const hasMixedCaseWord = /[A-Z][a-z]{2,}/.test(trimmed);
    const hasWordSeparator = /[-_]/.test(trimmed) && /[A-Za-z]{4,}/.test(trimmed);

    /*
     * Random tokens (nanoid/base62 ids) mix character classes with high
     * entropy: digits interleaved with letters, or the URL-safe `-`/`_`
     * alphabet sprinkled mid-string. Human-typed names — even long, all
     * lowercase, separator-free ones like `featurelandingpageredesign` or a
     * name with a trailing year like `myportfoliowebsite2026` — do not look
     * random. Only treat a 20+ char string as opaque when it actually shows
     * the charset mixing of an id, otherwise we'd hide legitimate branch and
     * project names behind a generic fallback.
     */
    if (!hasMixedCaseWord && !hasWordSeparator && looksRandomlyMixed(trimmed)) {
      return true;
    }
  }

  return false;
}

/*
 * Heuristic for "looks like a random id" as opposed to a human-typed word.
 * Real nanoid/base62 tokens interleave digits and letters throughout the
 * string and/or use the URL-safe `-`/`_` alphabet. A run of plain letters
 * (an English-ish word), optionally with a trailing number cluster (a year or
 * version suffix), is a name, not an id.
 */
function looksRandomlyMixed(value: string): boolean {
  const hasLetters = /[A-Za-z]/.test(value);
  const hasDigits = /[0-9]/.test(value);
  const hasUrlSafeSeparator = /[-_]/.test(value);

  /*
   * Words may carry a trailing version/year suffix (e.g. `...website2026`).
   * Strip a single trailing digit cluster before judging interleaving so such
   * names are not mistaken for random tokens.
   */
  const withoutTrailingDigits = value.replace(/[0-9]+$/, '');

  // Digits still embedded *inside* the remaining text → interleaved like an id.
  const hasInteriorDigits = /[0-9]/.test(withoutTrailingDigits);

  if (!hasLetters) {
    // All digits / separators — clearly not a human word; treat as opaque.
    return true;
  }

  if (hasUrlSafeSeparator) {
    return true;
  }

  if (hasDigits && hasInteriorDigits) {
    return true;
  }

  return false;
}

export interface FriendlyLabel {
  display: string;
  full: string;
  isFallback: boolean;
}

export function friendlyLabel(value: string | null | undefined, fallback: string): FriendlyLabel {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    return { display: fallback, full: fallback, isFallback: true };
  }

  if (looksLikeOpaqueId(trimmed)) {
    return { display: fallback, full: trimmed, isFallback: true };
  }

  return { display: trimmed, full: trimmed, isFallback: false };
}

/*
 * Pick the first candidate that's a real human label. Opaque IDs are skipped
 * unless every candidate is opaque, in which case the final fallback wins.
 */
export function pickFriendlyLabel(candidates: Array<string | null | undefined>, fallback: string): FriendlyLabel {
  for (const candidate of candidates) {
    const label = friendlyLabel(candidate, fallback);

    if (!label.isFallback) {
      return label;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return { display: fallback, full: candidate.trim(), isFallback: true };
    }
  }

  return { display: fallback, full: fallback, isFallback: true };
}
