/*
 * Number → compact badge label. Never collapses to "99+" — when the count
 * crosses 999 the formatter switches to Intl compact notation ("1.2K",
 * "12K"), matching the way GitHub / Linear / VSCode render high-volume
 * counts without throwing away precision the way a "99+" ceiling does.
 */

const COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatRailBadgeValue(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }

  const rounded = Math.floor(value);

  if (rounded < 1000) {
    return String(rounded);
  }

  return COMPACT_FORMATTER.format(rounded);
}
