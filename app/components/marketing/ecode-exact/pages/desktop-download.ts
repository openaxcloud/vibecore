/**
 * Download-URL helpers for the public Desktop ("E-Code on your desktop") page.
 *
 * The desktop release artifacts are published under a stable, versionless path so
 * the marketing page always points at the latest signed build. The per-OS button
 * URLs are derived purely from the artifact filename (e.g. `E-Code.dmg`), which
 * keeps the React component declarative and makes the URL derivation unit-testable
 * without rendering.
 */

/** Base directory (relative, same-origin) that hosts the latest desktop builds. */
export const DESKTOP_DOWNLOAD_BASE = '/download/desktop';

/**
 * Build the download URL for a desktop release artifact.
 *
 * @param file artifact filename, e.g. `E-Code.dmg` or `E-Code-Setup.exe`
 * @returns same-origin URL pointing at the latest signed build for that file
 */
export function desktopDownloadUrl(file: string): string {
  const trimmed = file.trim();

  if (!trimmed) {
    /*
     * Without a filename there is nothing meaningful to link to; fall back to the
     * releases index rather than emitting a dangling `.../` path.
     */
    return DESKTOP_DOWNLOAD_BASE;
  }

  // Drop any leading slashes so a caller-supplied path can't escape the base.
  const name = trimmed.replace(/^\/+/, '');

  return `${DESKTOP_DOWNLOAD_BASE}/${encodeURIComponent(name)}`;
}
