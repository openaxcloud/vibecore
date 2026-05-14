/**
 * Defensive normalization for shell commands sent into the WebContainer's
 * bundled jsh / BusyBox shell.
 *
 * Background:
 *   The BusyBox userland that ships with WebContainer's jsh does not accept
 *   the deprecated obsolete short flags for some POSIX utilities, e.g.
 *   `head -20` and `tail -20` (instead of the POSIX form `head -n 20`).
 *   Passing the obsolete form yields confusing errors such as
 *   `head: -20: No such file or directory` because the binary treats the
 *   numeric token as a filename instead of a count.
 *
 *   We control the JavaScript layer that injects AI-generated commands into
 *   the terminal but we do NOT control jsh's parser. The safe path is a
 *   conservative regex pass that rewrites only well-known deprecated forms
 *   to their POSIX equivalents, leaving every other token untouched so we
 *   never alter user intent.
 *
 * Scope:
 *   - Programmatic command execution (`BoltShell.executeCommand`).
 *   - NOT interactive keystrokes — we would need to buffer xterm input
 *     line-by-line, which breaks paste mode and TUI programs like vim.
 */

const HEAD_TAIL_OBSOLETE = /\b(head|tail)\s+-(\d+)(?=\s|$)/g;

/**
 * Apply every known shell-quirk rewrite to `command` and return the
 * normalized form. Idempotent: running the function twice on the same
 * input yields the same output.
 */
export function normalizeShellCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    return command;
  }

  return command.replace(HEAD_TAIL_OBSOLETE, (_match, utility: string, count: string) => `${utility} -n ${count}`);
}

/**
 * Splits a shell command on top-level pipes, returning each segment. Quoted
 * strings (single or double) are honoured so `echo "a | b" | head -1`
 * yields two segments and not three.
 *
 * Exposed for callers that want to reason about pipe topology (e.g. logging
 * which segment of a long pipeline failed); the normalizer itself does not
 * need to split because every targeted rewrite is local to a utility name.
 */
export function splitPipeSegments(command: string): string[] {
  const segments: string[] = [];

  let buffer = '';
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (const char of command) {
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      buffer += char;
      escape = true;
      continue;
    }

    if (quote) {
      buffer += char;

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
      continue;
    }

    if (char === '|') {
      segments.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) {
    segments.push(buffer.trim());
  }

  return segments;
}
