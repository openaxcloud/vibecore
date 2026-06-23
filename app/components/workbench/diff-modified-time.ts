/**
 * Formatting helper for the DiffView "Modified" timestamp.
 *
 * The diff header used to render `new Date().toLocaleTimeString()`, which always
 * showed the current wall-clock time (and changed on every re-render). The real
 * modification time lives on the tracked FileHistory (`lastModified`), so this
 * helper turns that epoch-millisecond value into a localized time string.
 */
export function formatModifiedTime(lastModified: number | undefined): string {
  if (lastModified === undefined || lastModified === null || !Number.isFinite(lastModified)) {
    return '';
  }

  const date = new Date(lastModified);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString();
}
