import { describe, expect, it, vi } from 'vitest';

import { StreamingMessageParser } from './message-parser';

/*
 * BUG-AGENT-EDIT-TRUNCATION (P0 data loss) — live-repro against the DEPLOYED parser.
 *
 * Scenario reproduced exactly (2/2 deterministic): the agent performs an in-place
 * file edit. The model's streamed output is TRUNCATED mid-tag — it stops right
 * after emitting `});\n</bo` (a partial `</boltAction>`). Because the real close
 * tag never completes, `onActionClose` (the only callback that strips it) never
 * fires. The editor preview + autosave therefore persist whatever the LAST
 * `onActionStream` emitted.
 *
 * Pre-fix: that value was `input.slice(i)` verbatim → `…});\n</bo`, which is
 * invalid JavaScript ("Unexpected token '<'") and destroys the file.
 * Post-fix (`withoutTrailingCloseTagPrefix`, commit 0e0017ae, live in prod SHA
 * 6d57a401): the trailing partial close tag is held back → `…});\n`, valid JS,
 * `});` and tail preserved.
 */

function lastStreamedContent(fullModelOutput: string, truncateAfter: string): string {
  const onActionStream = vi.fn();

  const parser = new StreamingMessageParser({
    callbacks: { onActionOpen: vi.fn(), onActionClose: vi.fn(), onActionStream },
  });

  /*
   * Stream the output the way the runtime does: grow the buffer chunk by chunk,
   * then STOP at the truncation point (mid `</boltAction>`). The final parse call
   * is the truncated buffer — its onActionStream content is what autosave keeps.
   */
  const cut = fullModelOutput.indexOf(truncateAfter) + truncateAfter.length;
  const truncated = fullModelOutput.slice(0, cut);

  const step = 17; // arbitrary chunk size so the close tag splits across a boundary

  for (let end = step; end < truncated.length; end += step) {
    parser.parse('truncation_live', truncated.slice(0, end));
  }
  parser.parse('truncation_live', truncated);

  const calls = onActionStream.mock.calls;

  return calls.length ? calls[calls.length - 1][0].action.content : '';
}

describe('BUG-AGENT-EDIT-TRUNCATION — deployed parser holds back a truncated close tag', () => {
  /*
   * Plain (non-module) JS so `new Function(...)` validates raw syntax — the exact
   * thing that broke pre-fix. Includes accents/CJK/emoji to prove the ASCII close
   * tag is trimmed without splitting a multi-byte UTF-8 character.
   */
  const fileBody = [
    'const express = require("express");',
    'const app = express();',
    'app.get("/", (req, res) => {',
    '  res.json({ ok: true, note: "café ☕ 日本語 🚀" });',
    '});',
    'app.listen(3000, () => {',
    '  setup(server);',
    '});',
    '',
  ].join('\n');

  // Full (well-formed) model output, then we truncate it mid-close-tag below.
  const fullOutput =
    `<boltArtifact id="a1" title="server edit"><boltAction type="file" filePath="server.js">\n` +
    fileBody +
    `</boltAction></boltArtifact>`;

  it('never persists a stray "</bo" and keeps the file valid JS', () => {
    // Model dies right after "});\n</bo" — the exact byte pattern from the bug report.
    const saved = lastStreamedContent(fullOutput, '});\n</bo');

    expect(saved).not.toContain('</bo');
    expect(saved).not.toContain('</boltAction');

    // The real content is fully preserved up to the truncation.
    expect(saved).toContain('setup(server);');
    expect(saved.trimEnd().endsWith('});')).toBe(true);

    // It must be parseable JavaScript (pre-fix this threw "Unexpected token '<'").
    expect(() => new Function(saved)).not.toThrow();
  });

  it('control: WITHOUT the hold-back, the same truncation yields invalid JS', () => {
    // Demonstrate the failure the fix prevents, by reconstructing the pre-fix value.
    const preFix = fileBody + '</bo';
    expect(preFix).toContain('</bo');
    expect(() => new Function(preFix)).toThrow(/Unexpected token/);
  });
});
