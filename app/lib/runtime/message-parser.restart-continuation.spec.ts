import { describe, expect, it, vi } from 'vitest';

import { StreamingMessageParser } from './message-parser';

/*
 * BUG-AGENT-004 (P0) — the model restarts a file mid-action and the parser
 * swallows the restart AS FILE CONTENT.
 *
 * Reproduced live on the audit env (2026-08-15, project
 * `cmsuyqriz000c0ndabnmnzzc6`). Generation hit the token cap inside
 * `src/App.tsx`, so the model continued IN THE SAME MESSAGE: a sentence, then a
 * fresh `<boltArtifact>` / `<boltAction …>` re-emitting the whole file.
 * `insideAction` was still true, so prose and markup alike were appended to the
 * file. The delivered `src/App.tsx` (byte-identical in project storage and in
 * the runtime pod, 7876 B) contained:
 *
 *    19| const [editingNote, setEditingNote]Je continue la génération…
 *    22| <boltArtifact id="notes-manager-continued" …>
 *    23| <boltAction type="file" filePath="src/App.tsx" …>
 *    24| import { useCallback, useMemo, useState } from 'react';   <-- imports #2
 *
 * Duplicate declarations, so Vite answered 500 on `/src/App.tsx` and the
 * preview stayed blank — even though every file had reached the pod.
 */

function closedContentFor(output: string): string | undefined {
  const onActionClose = vi.fn();

  const parser = new StreamingMessageParser({
    callbacks: { onActionOpen: vi.fn(), onActionClose, onActionStream: vi.fn() },
  });

  parser.parse('assistant-restart', output);

  const fileCalls = onActionClose.mock.calls.filter(([data]) => data?.action?.filePath === 'src/App.tsx');

  return fileCalls.length ? fileCalls[fileCalls.length - 1][0].action.content : undefined;
}

/** Truncated first emission, then the model starts over in the same message. */
const RESTARTED_OUTPUT = [
  '<boltArtifact id="notes-manager" title="Gestionnaire de Notes">',
  '<boltAction type="file" filePath="src/App.tsx">',
  "import { useState } from 'react';",
  '',
  'export default function App() {',
  '  const [editingNote, setEditingNote]',
  "Je continue la génération de l'application à partir de `src/App.tsx`.",
  '',
  '<boltArtifact id="notes-manager-continued" title="Gestionnaire de Notes - Suite">',
  '<boltAction type="file" filePath="src/App.tsx">',
  "import { useState } from 'react';",
  '',
  'export default function App() {',
  '  return <main>OK</main>;',
  '}',
  '</boltAction>',
  '</boltArtifact>',
].join('\n');

describe('BUG-AGENT-004 — a restart mid-action must not be written into the file', () => {
  it('delivers only the re-emitted file, not the abandoned partial', () => {
    const content = closedContentFor(RESTARTED_OUTPUT);

    expect(content).toBeDefined();
    expect(content).toContain('return <main>OK</main>;');
  });

  it('never writes the platform markup or the model prose into the file', () => {
    const content = closedContentFor(RESTARTED_OUTPUT) ?? '';

    expect(content).not.toContain('<boltAction');
    expect(content).not.toContain('<boltArtifact');
    expect(content).not.toContain('Je continue la génération');
  });

  it('does not emit the import line twice (the duplicate-declaration crash)', () => {
    const content = closedContentFor(RESTARTED_OUTPUT) ?? '';
    const imports = content.split('\n').filter((line) => line.startsWith("import { useState } from 'react';"));

    expect(imports).toHaveLength(1);
  });

  it('leaves a normally-closed action untouched', () => {
    const normal = [
      '<boltArtifact id="ok" title="OK">',
      '<boltAction type="file" filePath="src/App.tsx">',
      'export default function App() {',
      '  return <main>Single</main>;',
      '}',
      '</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    const content = closedContentFor(normal) ?? '';

    expect(content).toContain('return <main>Single</main>;');
    expect(content).not.toContain('<boltAction');
  });
});
