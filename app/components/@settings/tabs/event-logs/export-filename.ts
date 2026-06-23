/**
 * Build a cross-platform-safe download filename for an event-logs export.
 *
 * The timestamp comes from `Date#toISOString()`, which contains ':' and '.'
 * characters. Colons are illegal in Windows filenames (the browser's save
 * dialog strips/rejects them), so we replace ':' and '.' with '-' to keep the
 * suggested filename valid on every platform.
 *
 * @param extension File extension without the leading dot, e.g. 'json'.
 * @param date Optional date to stamp (defaults to now); used for testability.
 */
export function buildExportFilename(extension: string, date: Date = new Date()): string {
  const safeTimestamp = date.toISOString().replace(/[:.]/g, '-');

  return `ecode-event-logs-${safeTimestamp}.${extension}`;
}
