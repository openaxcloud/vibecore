import { describe, expect, it } from 'vitest';

import { buildSelfRepairPrompt, detectHunkLanguage, validateAndFormatHunk } from './hunk-validate';

describe('detectHunkLanguage', () => {
  it('maps known extensions to language codes', () => {
    expect(detectHunkLanguage('src/App.tsx')).toBe('tsx');
    expect(detectHunkLanguage('src/util.ts')).toBe('typescript');
    expect(detectHunkLanguage('lib/run.js')).toBe('javascript');
    expect(detectHunkLanguage('component.jsx')).toBe('jsx');
    expect(detectHunkLanguage('package.json')).toBe('json');
    expect(detectHunkLanguage('styles/app.css')).toBe('css');
    expect(detectHunkLanguage('styles/theme.scss')).toBe('scss');
    expect(detectHunkLanguage('docs/intro.md')).toBe('markdown');
  });

  it('falls back to "unknown" for unrecognised extensions and bare paths', () => {
    expect(detectHunkLanguage('LICENSE')).toBe('unknown');
    expect(detectHunkLanguage('binary.bin')).toBe('unknown');
    expect(detectHunkLanguage('odd.')).toBe('unknown');
  });
});

describe('validateAndFormatHunk', () => {
  it('parses valid TypeScript without formatting when format=false', async () => {
    const source = 'export const value: number = 12;';
    const result = await validateAndFormatHunk('src/value.ts', source, { format: false });

    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      expect(result.formatted).toBe(source);
      expect(result.language).toBe('typescript');
    }
  });

  it('returns a structured error with line/column when the parser fails', async () => {
    const result = await validateAndFormatHunk('src/broken.ts', 'export const x = ;', { format: false });

    expect(result.kind).toBe('error');

    if (result.kind === 'error') {
      expect(result.language).toBe('typescript');
      expect(result.message.length).toBeGreaterThan(0);
      expect(typeof result.line).toBe('number');
    }
  });

  it('parses TSX with embedded JSX', async () => {
    const source = `
import { type FC } from 'react';
export const App: FC = () => <div className="x">hello</div>;
`.trim();

    const result = await validateAndFormatHunk('src/App.tsx', source, { format: false });
    expect(result.kind).toBe('ok');
  });

  it('rejects invalid JSON before write', async () => {
    const result = await validateAndFormatHunk('package.json', '{ not-quoted: true }', { format: false });
    expect(result.kind).toBe('error');

    if (result.kind === 'error') {
      expect(result.language).toBe('json');
    }
  });

  it('skips unknown languages so the writer falls through to as-is', async () => {
    const result = await validateAndFormatHunk('LICENSE', 'Some text content', { format: false });
    expect(result.kind).toBe('skipped');
  });
});

describe('buildSelfRepairPrompt', () => {
  it('quotes the failing source and the parser error back to the LLM', () => {
    const prompt = buildSelfRepairPrompt('src/broken.ts', 'export const x = ;', {
      kind: 'error',
      message: 'Unexpected token, expected expression',
      line: 1,
      column: 17,
      language: 'typescript',
    });

    expect(prompt).toContain('`src/broken.ts`');
    expect(prompt).toContain('at line 1, column 17');
    expect(prompt).toContain('Unexpected token, expected expression');
    expect(prompt).toContain('export const x = ;');
  });

  it('omits the column hint when none is available', () => {
    const prompt = buildSelfRepairPrompt('src/broken.ts', 'broken', {
      kind: 'error',
      message: 'Bad',
      line: 5,
      language: 'typescript',
    });

    expect(prompt).toContain('at line 5:');
    expect(prompt).not.toContain('column');
  });
});
