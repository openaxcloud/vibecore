import { describe, expect, it, vi } from 'vitest';

import { StreamingMessageParser } from './message-parser';
import { sanitizeFileContent } from '~/utils/sanitize-file-content';

/*
 * BUG-AGENT-TRANSPORT-MARKUP (P0 file contamination) — repro against the
 * DEPLOYED parser + write boundary.
 *
 * Observed in prod (SOLUTIONS_REAL_PROOF_BLOCKERS.md §4): one fresh Website
 * Builder generation appended an `antml` closing wrapper to TEN source and
 * configuration files, and repair prompts reproduced it. `antml` is the model's
 * own transport namespace — it appears NOWHERE in this repo's source, so it can
 * only have arrived by the parser copying the model's raw stream verbatim into
 * file content.
 *
 * Two shapes were observed, both reproduced here:
 *   (a) COMPLETE wrapper emitted just before the real `</boltAction>` close —
 *       the close path finds `</boltAction>`, so the content it commits is
 *       `…code…</invoke>`. This is the shape that hits many files in one
 *       generation (every action closes normally, each one contaminated).
 *   (b) TRUNCATED wrapper at the very end of the stream (`</antml`) with no
 *       close tag — `onActionClose` never fires, so autosave persists whatever
 *       the last `onActionStream` emitted. This is the same failure class as
 *       BUG-AGENT-EDIT-TRUNCATION but the existing hold-back only covers
 *       suffixes of `</boltAction>`, and `</antml` is not one of them.
 *
 * The invariant under test is absolute: NO fragment of a transport/artifact tag
 * may ever reach the bytes we write to disk.
 */

/*
 * Both leaked shapes must be caught: the namespaced `antml:` family and the bare
 * `invoke` / `function_calls` / `parameter` wrappers. Built by concatenation so
 * the literals survive any tooling that rewrites transport markup in source.
 */
const NS = `${'antml'}:`;
const TRANSPORT_MARKUP_RE = new RegExp(`${NS}|</?(?:function_calls|invoke|parameter)\\b`, 'i');

/** A complete namespaced closing wrapper, as leaked in prod. */
const NS_CLOSE = `</${NS}invoke>`;

/** The truncated fragment observed on disk in the prod repro. */
const NS_TRUNCATED = `</${NS.slice(0, -1)}`;

/** Content the close path commits — i.e. exactly what ActionRunner writes. */
function closedActionContent(fullModelOutput: string): string {
  const onActionClose = vi.fn();

  const parser = new StreamingMessageParser({
    callbacks: { onActionOpen: vi.fn(), onActionStream: vi.fn(), onActionClose },
  });

  // Stream it the way the runtime does: a growing buffer, chunk by chunk.
  const step = 13;

  for (let end = step; end < fullModelOutput.length; end += step) {
    parser.parse('transport_markup', fullModelOutput.slice(0, end));
  }
  parser.parse('transport_markup', fullModelOutput);

  const calls = onActionClose.mock.calls;

  return calls.length ? calls[calls.length - 1][0].action.content : '';
}

/** Content the LAST stream tick emitted — i.e. what autosave keeps when the stream dies. */
function lastStreamedContent(truncatedModelOutput: string): string {
  const onActionStream = vi.fn();

  const parser = new StreamingMessageParser({
    callbacks: { onActionOpen: vi.fn(), onActionClose: vi.fn(), onActionStream },
  });

  const step = 13;

  for (let end = step; end < truncatedModelOutput.length; end += step) {
    parser.parse('transport_markup_trunc', truncatedModelOutput.slice(0, end));
  }
  parser.parse('transport_markup_trunc', truncatedModelOutput);

  const calls = onActionStream.mock.calls;

  return calls.length ? calls[calls.length - 1][0].action.content : '';
}

const fileBody = [
  'import { useState } from "react";',
  '',
  'export default function App() {',
  '  const [count, setCount] = useState(0);',
  '  return <button onClick={() => setCount(count + 1)}>{count}</button>;',
  '}',
].join('\n');

describe('BUG-AGENT-TRANSPORT-MARKUP — transport wrappers never reach disk', () => {
  it('(a) strips a COMPLETE transport wrapper emitted before the real close tag', () => {
    const output = [
      '<boltArtifact id="app" title="App">',
      '<boltAction type="file" filePath="src/App.tsx">',
      fileBody,
      NS_CLOSE,
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const committed = closedActionContent(output);

    expect(committed).not.toMatch(TRANSPORT_MARKUP_RE);
    expect(committed).toContain('export default function App()');
    expect(committed).toContain('setCount(count + 1)');
  });

  it('(b) holds back a TRUNCATED transport fragment when the stream dies mid-tag', () => {
    const truncated = [
      '<boltArtifact id="app" title="App">',
      '<boltAction type="file" filePath="src/App.tsx">',
      fileBody,
      NS_TRUNCATED,
    ].join('\n');

    const streamed = lastStreamedContent(truncated);

    expect(streamed).not.toMatch(TRANSPORT_MARKUP_RE);
    expect(streamed).toContain('export default function App()');
  });

  it('(c) the write boundary refuses to persist transport markup for any file type', () => {
    // Even if a caller bypasses the parser, nothing contaminated may hit disk.
    for (const filePath of ['src/App.tsx', 'README.md', 'vite.config.ts', 'src/styles.css']) {
      const result = sanitizeFileContent(`${fileBody}\n${NS_CLOSE}\n`, filePath);

      expect(result.sanitized).not.toMatch(TRANSPORT_MARKUP_RE);
      expect(result.transportMarkupStripped).toBeGreaterThan(0);
    }
  });

  it('(c2) a contaminated package.json is repaired to valid JSON rather than rejected', () => {
    // The prod repro contaminated CONFIG files too; stripping must restore parseability.
    const pkg = `${JSON.stringify({ name: 'app', scripts: { dev: 'vite' } }, null, 2)}\n${NS_CLOSE}\n`;

    const result = sanitizeFileContent(pkg, 'package.json');

    expect(result.sanitized).not.toMatch(TRANSPORT_MARKUP_RE);
    expect(JSON.parse(result.sanitized)).toMatchObject({ scripts: { dev: 'vite' } });
  });

  it('(d) does NOT touch legitimate source that merely looks tag-ish', () => {
    // Guard against the over-eager-cleaning regressions this file's neighbours document.
    const legit = [
      'const html = "<a href=\\"/x\\">link</a>";',
      'export const Cmp = () => <div className="text-red-500">a &lt; b</div>;',
      '// closing tags: </div> </span> </>',
    ].join('\n');

    expect(sanitizeFileContent(legit, 'src/Legit.tsx').sanitized).toBe(legit);
    expect(sanitizeFileContent(legit, 'src/Legit.tsx').transportMarkupStripped).toBe(0);
  });
});
