export interface CommandPaletteItem {
  label: string;
  to: string;

  /** Optional secondary text shown to the right (e.g. "Project", "Action"). */
  hint?: string;
}

/**
 * Normalize a string for fuzzy matching: lowercase + collapse whitespace.
 */
function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Returns true when every character of `query` appears in `target` in order
 * (subsequence match), which gives a forgiving "fuzzy" feel without a heavy
 * scoring library. An empty query always matches.
 */
export function fuzzyMatches(target: string, query: string): boolean {
  const haystack = target.toLowerCase();
  const needle = normalizeQuery(query);

  if (needle.length === 0) {
    return true;
  }

  let haystackIndex = 0;

  for (const char of needle) {
    if (char === ' ') {
      continue;
    }

    const found = haystack.indexOf(char, haystackIndex);

    if (found === -1) {
      return false;
    }

    haystackIndex = found + 1;
  }

  return true;
}

/**
 * Filter command-palette items by a (possibly empty) query, matching against
 * both the label and the destination so users can search "/usage" or "usage".
 */
export function filterCommandPaletteItems<T extends CommandPaletteItem>(items: T[], query: string): T[] {
  const trimmed = normalizeQuery(query);

  if (trimmed.length === 0) {
    return items;
  }

  return items.filter((item) => fuzzyMatches(item.label, trimmed) || fuzzyMatches(item.to, trimmed));
}

/**
 * Clamp a selection index into the valid range for `length` items, wrapping
 * around the ends so ArrowDown past the bottom returns to the top.
 */
export function clampSelectionIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  const wrapped = index % length;

  return wrapped < 0 ? wrapped + length : wrapped;
}

export type CommandPaletteKey = 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape' | string;

export interface CommandPaletteKeyResult<T extends CommandPaletteItem> {
  /** Next highlighted index (already clamped/wrapped). */
  nextIndex: number;

  /** The item to navigate to, when the key triggers a selection. */
  navigateTo?: T;

  /** Whether the palette should close (Escape). */
  close: boolean;

  /** Whether the key was handled (so the caller can preventDefault). */
  handled: boolean;
}

/**
 * Pure reducer for command-palette keyboard navigation. Given the current
 * highlighted index, the visible (already-filtered) items, and a pressed key,
 * it returns the next highlight, an optional navigation target, and whether the
 * event was handled. Kept side-effect free so it is unit-testable.
 */
export function resolveCommandPaletteKey<T extends CommandPaletteItem>(
  key: CommandPaletteKey,
  currentIndex: number,
  visibleItems: T[],
): CommandPaletteKeyResult<T> {
  const length = visibleItems.length;
  const safeIndex = clampSelectionIndex(currentIndex, Math.max(length, 1));

  if (key === 'ArrowDown') {
    return { nextIndex: clampSelectionIndex(safeIndex + 1, length), close: false, handled: length > 0 };
  }

  if (key === 'ArrowUp') {
    return { nextIndex: clampSelectionIndex(safeIndex - 1, length), close: false, handled: length > 0 };
  }

  if (key === 'Enter') {
    const target = visibleItems[safeIndex];

    return { nextIndex: safeIndex, navigateTo: target, close: false, handled: Boolean(target) };
  }

  if (key === 'Escape') {
    return { nextIndex: safeIndex, close: true, handled: true };
  }

  return { nextIndex: safeIndex, close: false, handled: false };
}
