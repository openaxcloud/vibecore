import { describe, expect, it } from 'vitest';
import { parseProblemLocation } from './problem-location';

describe('parseProblemLocation', () => {
  it('reads the Vite/babel parenthesised form that Problems could not link before', () => {
    // Verbatim from prod (audit cluster D): app.e-code.ai, QA project, broken JSX.
    const line = '3:08:59 PM [vite] Pre-transform error: /workspace/src/App.tsx: Unterminated JSX contents. (1:60)';

    expect(parseProblemLocation(line)).toEqual({ path: '/workspace/src/App.tsx', line: 1, column: 60 });
  });

  it('reads the babel plugin variant', () => {
    const line =
      "2:38:48 PM [vite] Pre-transform error: /workspace/src/App.tsx: Support for the experimental syntax 'decorators' isn't currently enabled (1:71):";

    expect(parseProblemLocation(line)).toEqual({ path: '/workspace/src/App.tsx', line: 1, column: 71 });
  });

  it('still reads the esbuild / stack-trace colon form', () => {
    expect(parseProblemLocation('ERROR: src/server.ts:42:7: Unexpected token')).toEqual({
      path: 'src/server.ts',
      line: 42,
      column: 7,
    });
    expect(parseProblemLocation('    at renderApp (/workspace/src/main.tsx:12)')).toEqual({
      path: '/workspace/src/main.tsx',
      line: 12,
      column: undefined,
    });
  });

  it('does not invent a location when the message carries none', () => {
    expect(parseProblemLocation('npm warn allow-scripts esbuild@0.21.5 (postinstall: node install.js)')).toBeNull();
    expect(parseProblemLocation('Error: Port 5173 is already in use')).toBeNull();
  });

  it('does not read the clock in a log prefix as a file position', () => {
    expect(parseProblemLocation('3:08:59 PM [vite] hmr update')).toBeNull();
  });

  it('pairs the position with the file on the same line only', () => {
    const twoLines = ['[vite] Pre-transform error: /workspace/src/App.tsx: bad', 'something else (9:9)'].join('\n');

    // No same-line pairing -> falls back to nothing rather than a wrong line.
    expect(parseProblemLocation(twoLines)).toBeNull();
  });
});
