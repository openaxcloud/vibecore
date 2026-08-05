import { USER_AREA_LOCALE } from '~/lib/i18n/user-area-locale';

/*
 * Number → compact badge label. Never collapses to "99+" — when the count
 * crosses 999 the formatter switches to Intl compact notation ("1.2K",
 * "12K"), matching the way GitHub / Linear / VSCode render high-volume
 * counts without throwing away precision the way a "99+" ceiling does.
 */

export function formatRailBadgeValue(value: number, language?: string | null): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }

  const rounded = Math.floor(value);

  if (rounded < 1000) {
    return String(rounded);
  }

  /*
   * Normalize the compact suffix to uppercase: some ICU builds render the
   * en-GB compact thousand marker as "1k" (lowercase), others "1K" — the CI
   * runner and local Node disagreed. The badge contract is the GitHub-style
   * uppercase "1.2K", independent of the host's ICU data.
   */
  const locale = language?.toLowerCase().startsWith('fr') ? 'fr-FR' : USER_AREA_LOCALE;

  const formatted = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(rounded);

  return locale === USER_AREA_LOCALE ? formatted.toUpperCase() : formatted;
}
