import { resolveDiffViewLanguage } from '~/lib/i18n/catalogs/diff-view';

/**
 * Formatting helper for the DiffView modification timestamp.
 *
 * The diff header used to render `new Date().toLocaleTimeString()`, which always
 * showed the current wall-clock time (and changed on every re-render). The real
 * modification time lives on the tracked FileHistory (`lastModified`), so this
 * helper turns that epoch-millisecond value into a localized date-and-time string.
 */
export function formatModifiedTime(lastModified: number | undefined, language?: string | null): string {
  if (lastModified === undefined || lastModified === null || !Number.isFinite(lastModified)) {
    return '';
  }

  const date = new Date(lastModified);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(resolveDiffViewLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
