import { describe, expect, it } from 'vitest';
import { parseConsoleSourceRefs, type ConsoleSourceRef } from './Preview';

/*
 * F7 — `path:line[:col]` references in preview console/stack text must become
 * clickable jumps to the source. parseConsoleSourceRefs is the pure regex layer:
 * it splits text into plain-text and reference segments so the render layer can
 * resolve each path against the workbench and wire (or not) a clickable button.
 */
function refsOf(text: string): ConsoleSourceRef[] {
  return parseConsoleSourceRefs(text)
    .filter((segment): segment is Extract<typeof segment, { type: 'ref' }> => segment.type === 'ref')
    .map((segment) => segment.ref);
}

describe('parseConsoleSourceRefs', () => {
  it('parses a bare workspace-relative path with line and column', () => {
    expect(refsOf('Error in src/App.tsx:12:5')).toEqual([{ path: 'src/App.tsx', line: 12, column: 5 }]);
  });

  it('parses a path with only a line (no column)', () => {
    expect(refsOf('at src/main.ts:8')).toEqual([{ path: 'src/main.ts', line: 8, column: undefined }]);
  });

  it('parses a leading-slash absolute /home/project path', () => {
    expect(refsOf('    at fn (/home/project/src/utils/foo.ts:3:10)')).toEqual([
      { path: '/home/project/src/utils/foo.ts', line: 3, column: 10 },
    ]);
  });

  it('parses a full Vite iframe URL, keeping the port out of the line number', () => {
    expect(refsOf('at http://localhost:5173/src/App.tsx:15:20')).toEqual([
      { path: 'http://localhost:5173/src/App.tsx', line: 15, column: 20 },
    ]);
  });

  it('parses a Vite URL that carries a ?t= cache-busting query', () => {
    expect(refsOf('http://localhost:5173/src/App.tsx?t=1699999999:42:7')).toEqual([
      { path: 'http://localhost:5173/src/App.tsx?t=1699999999', line: 42, column: 7 },
    ]);
  });

  it('extracts every ref from a multi-frame stack trace', () => {
    const stack = [
      'TypeError: x is not a function',
      '    at render (/home/project/src/App.tsx:12:5)',
      '    at run (/home/project/src/lib/run.ts:99)',
    ].join('\n');

    expect(refsOf(stack)).toEqual([
      { path: '/home/project/src/App.tsx', line: 12, column: 5 },
      { path: '/home/project/src/lib/run.ts', line: 99, column: undefined },
    ]);
  });

  it('ignores host:port and clock-style tokens that are not source files', () => {
    expect(refsOf('Connected to localhost:5173 at 12:34:56')).toEqual([]);
  });

  it('returns a single text segment when there is no ref', () => {
    expect(parseConsoleSourceRefs('just a plain message')).toEqual([{ type: 'text', value: 'just a plain message' }]);
  });

  it('preserves surrounding text as segments around a ref', () => {
    expect(parseConsoleSourceRefs('before src/App.tsx:1:2 after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'ref', value: 'src/App.tsx:1:2', ref: { path: 'src/App.tsx', line: 1, column: 2 } },
      { type: 'text', value: ' after' },
    ]);
  });

  it('returns no segments for empty input', () => {
    expect(parseConsoleSourceRefs('')).toEqual([]);
  });
});
