/**
 * True when an assistant response contains at least one file-writing action —
 * a `<boltAction type="file" …>` block that the runtime applies to disk.
 *
 * A build-mode generation that finishes with NONE of these produced nothing
 * usable: a weak model (e.g. gpt-3.5-turbo) narrates the plan in prose instead
 * of emitting the artifact actions, so no files land, the preview stays PENDING,
 * and the run "completes" with only a README. Detecting the zero-file case lets
 * the chat surface a clear, actionable message instead of a silent stall.
 *
 * Matches either attribute order (`type` before or after `filePath`) and single
 * or double quotes, tolerating extra whitespace around `=`.
 */
export function responseEmittedFileAction(text: string): boolean {
  if (!text) {
    return false;
  }

  return /<boltAction\b[^>]*\btype\s*=\s*["']file["']/i.test(text);
}
