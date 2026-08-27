/**
 * Recover a `file:line` target from a runtime diagnostic message so the Problems
 * panel can render a jump-to-source link.
 *
 * Runtime diagnostics are parsed log lines with no structured file/line field,
 * so the location has to be read back out of the text. Dev servers use two
 * different shapes for it and the panel must handle both:
 *
 *  - esbuild / stack traces / tsc  -> `src/App.tsx:12:5`   (colon form)
 *  - Vite + babel plugins          -> `... /workspace/src/App.tsx: Unterminated
 *                                      JSX contents. (4:31)` (parenthesised form)
 *
 * Only the colon form used to be matched, so the single most common real error
 * class in this product — a Vite pre-transform failure — showed up in Problems
 * with no way to jump to the offending line even though the message spelled the
 * file and position out (audit cluster D, BUG-IDE-004).
 */

export interface ProblemLocation {
  path: string;
  line: number;
  column?: number;
}

const FILE_PATH = String.raw`(?:\/|\.{0,2}\/)?[\w@][\w@./-]*\.[a-z]{2,6}`;

/** `src/App.tsx:12` / `src/App.tsx:12:5` */
const COLON_LOCATION = new RegExp(`(${FILE_PATH}):(\\d+)(?::(\\d+))?`, 'i');

/**
 * `/workspace/src/App.tsx: <message> (4:31)` — the file and the position are
 * separated by the human-readable reason, so they are captured independently.
 * Bounded to a single line so a path on one log line can never be paired with a
 * position from an unrelated one.
 */
const PAREN_LOCATION = new RegExp(`(${FILE_PATH}):[^\\n(]*\\((\\d+):(\\d+)\\)`, 'i');

export function parseProblemLocation(text: string): ProblemLocation | null {
  /*
   * The parenthesised form is tried first: its own path also matches the colon
   * form's `path:` prefix, and preferring the colon form there would read the
   * message text instead of a line number.
   */
  const paren = PAREN_LOCATION.exec(text);

  if (paren) {
    return { path: paren[1], line: Number.parseInt(paren[2], 10), column: Number.parseInt(paren[3], 10) };
  }

  const colon = COLON_LOCATION.exec(text);

  if (colon) {
    return {
      path: colon[1],
      line: Number.parseInt(colon[2], 10),
      column: colon[3] ? Number.parseInt(colon[3], 10) : undefined,
    };
  }

  return null;
}
