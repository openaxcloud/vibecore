/*
 * Strip vibecore's internal jsh handshake OSC sequences from a terminal
 * data event before forwarding it to xterm.js.
 *
 * The jsh process announces lifecycle events through `\x1b]654;<payload>\x07`
 * (interactive, prompt, exit, etc.). Those bytes are meant to be intercepted
 * by the host (see `shell.ts`), not rendered. xterm.js will usually swallow
 * the unknown OSC silently, but when the sequence is malformed or split
 * across two `data` events it leaks `]` and partial payload characters into
 * the visible buffer (the source of the `]]]]]]]]]` runs the user reports).
 *
 * Stripping the complete sequence at ingest keeps the handshake intact for
 * the matcher upstream while removing every byte before xterm sees it.
 */

const INTERNAL_OSC_PATTERN = /\x1b\]654;[^\x07]*\x07/g;

export function stripInternalOscMarkers(data: string): string {
  if (!data) {
    return data;
  }

  return data.replace(INTERNAL_OSC_PATTERN, '');
}
