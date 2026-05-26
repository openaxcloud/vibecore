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

    if (!hasMixedCaseWord && !hasWordSeparator) {
      return true;
    }
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
