import { describe, expect, it } from 'vitest';
import { responseEmittedFileAction } from './response-file-actions';

describe('responseEmittedFileAction', () => {
  it('detects a standard file action', () => {
    expect(
      responseEmittedFileAction(
        '<boltArtifact id="x"><boltAction type="file" filePath="src/App.tsx">code</boltAction>',
      ),
    ).toBe(true);
  });

  it('tolerates single quotes, extra whitespace, and reversed attribute order', () => {
    expect(responseEmittedFileAction("<boltAction filePath='a.ts' type = 'file'>x</boltAction>")).toBe(true);
  });

  it('is false for a prose-only plan with no file actions (the weak-model stall)', () => {
    const prose = 'Here is the plan:\n1. Create package.json\n2. Add src/App.tsx\n3. Wire up routing.';
    expect(responseEmittedFileAction(prose)).toBe(false);
  });

  it('is false for non-file actions (shell/start only)', () => {
    expect(responseEmittedFileAction('<boltAction type="shell">npm i</boltAction>')).toBe(false);
    expect(responseEmittedFileAction('<boltAction type="start">npm run dev</boltAction>')).toBe(false);
  });

  it('is false for empty/undefined input', () => {
    expect(responseEmittedFileAction('')).toBe(false);
    expect(responseEmittedFileAction(undefined as unknown as string)).toBe(false);
  });
});
